import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 丰川祥子 (sakiko), v2 (2026-10-30). Do not import write-sheets.ts.
   Special columns, all side-on facing right:
   U 忘却之影 (the front hand swept back high in a flourish / the low landing after the blink, one
   knee bent, a hand forward / upright again), I 神威 (a hand lifting the skirt, the front foot raised /
   the stomp, arms out for balance / hands folded at the waist, chin up), O 双月轮舞 (the lean into the
   start / the low glide, arms trailing / the brake, back foot dragging), L 血月的奏鸣 (hands raised over
   the two keyboards / both hands pressing / one hand sweeping along the keys). The keyboards are drawn
   in the L column; the img2img prompt sets them one on each side, tilted toward the viewer.
   155 cm, so the slim build. Common is the shared empty-hand human sheet.
   shiro.png is the 白祥 phantom: one standing figure on a transparent 256 cell (a prop, no backdrop).
   Colour blocks only: hair, clothes and shoes belong to the img2img prompt.
   `--svg <dir>` writes the SVGs there instead (for a machine without Chrome to rasterize). */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean;
  /** Horizontal shift of the whole figure, so a cycle can travel inside the cell. */
  ox?: number;
  /** Vertical shift (negative lifts the figure off the foot line) for the cells that are in the air. */
  oy?: number;
  /** Head angle. Defaults to the spine, so a crawl can keep the chest low and the face up. */
  neck?: number;
  /** Kept for the shared figure(); unused here. */
  stick?: boolean;
  /** L column: the two keyboards ahead of her at hand height, the far one higher (the img2img prompt
   *  turns this into one on each side, tilted toward the viewer). */
  keys?: boolean;
}

/** Leg limb from absolute thigh / shin angles, undoing the knee bend figure() adds from `crouch`. */
const legAbs = (thigh: number, shin: number, crouch: number): Limb => [thigh - crouch * .03, shin - thigh + crouch * .06];

const IDLE: Pose = { lean: 0, crouch: 0, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
const BLOCK: Pose = { lean: -.05, crouch: 8, armF: [1.1, 1.5], armB: [.9, 1.7], legF: [.35, 0], legB: [-.2, 0] };
const HURT: Pose = { lean: -.3, crouch: 4, look: -.15, armF: [-.6, -.4], armB: [-.9, -.3], legF: [.4, 0], legB: [-.3, 0] };
const LYING: Pose = { ...HURT, crouch: 0, legF: [.1, 0], legB: [-.1, 0], lying: true };
const JUMP: Pose = { lean: .05, crouch: 0, armF: [2.4, -.4], armB: [-1.2, -.6], legF: [.9, -1.4], legB: [.3, -1.0] };
const PUNCH_WIND: Pose = { lean: -.08, crouch: 2, armF: [-.4, -1.9], armB: [.9, -1.6], legF: [.3, 0], legB: [-.3, 0] };
const PUNCH_HIT: Pose = { lean: .15, crouch: 2, look: .58, armF: [1.57, 0], armB: [.5, -1.8], legF: [.5, 0], legB: [-.4, 0] };
const KICK_WIND: Pose = { lean: -.1, crouch: 4, armF: [.5, -1.6], armB: [.8, -1.4], legF: [-.5, .8], legB: [0, 0] };
const KICK_HIT: Pose = { lean: -.25, crouch: 0, look: .5, armF: [-.3, -1.2], armB: [1.0, -1.2], legF: [1.5, .2], legB: [-.1, 0] };
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };
const RUN: Pose[] = [
  { lean: .1, crouch: 8, look: .55, armF: [-.85, -1.15], armB: [.95, 1.15], legF: [.55, -.4], legB: [-.55, .45] },
  { lean: .06, crouch: 2, look: .55, armF: [.6, 1.05], armB: [-.55, -1.05], legF: [-.35, .15], legB: [.85, -1.35] },
  { lean: .1, crouch: 8, look: .55, armF: [.95, 1.15], armB: [-.85, -1.15], legF: [-.55, .45], legB: [.55, -.4] },
  { lean: .06, crouch: 2, look: .55, armF: [-.55, -1.05], armB: [.6, 1.05], legF: [.85, -1.35], legB: [-.35, .15] },
];
const LOCO: Record<string, Pose> = {
  idle: IDLE, run0: RUN[0], run1: RUN[1], run2: RUN[2], run3: RUN[3],
  jump: JUMP, block: BLOCK, dodge: DODGE, hurt: HURT, down: LYING, ko: LYING,
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}


const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#7799CC';
/** 白祥 placeholder: the same figure washed pale. */
const SHIRO = '#dfe8f7';
const KEY_BODY = '#2b2733';
const KEY_WHITE = '#f1ece2';

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

function figure(pose: Pose, base: string): { svg: string; marks: Mark[] } {
  const d = DIMS.slim;
  const s = SHEET_SCALE;
  const dark = shade(base, .6);
  const light = shade(base, 1.35);
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
  parts.push(poly(torsoPoints(hip, shoulder, radii, 0), base));
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
  if (pose.keys) {
    // Two flat slabs at hand height: the far one higher and further, the near one lower and closer.
    const slab = (x: number, y: number, w: number, lift: number) => {
      const pts = [{ x, y }, { x: x + w, y: y - lift }, { x: x + w, y: y - lift + 9 }, { x, y: y + 9 }];
      parts.push(`<polygon points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="${KEY_BODY}" stroke="${OUTLINE}" stroke-width="3"/>`);
      parts.push(`<polygon points="${[{ x: x + 3, y: y + 1 }, { x: x + w - 3, y: y - lift + 1 }, { x: x + w - 3, y: y - lift + 5 }, { x: x + 3, y: y + 5 }].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="${KEY_WHITE}"/>`);
      for (const p of pts) marks.push({ x: p.x, y: p.y, r: 2 });
    };
    slab(hip.x + 34, hip.y - 26, 74, 8);
    slab(hip.x + 22, hip.y - 2, 84, 6);
  }
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, base);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, base);
  if (pose.stick) stickIn(shoulder, pose.armF);
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT + (pose.oy ?? 0)})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + (pose.oy ?? 0) + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number, base: string): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose, base) : null;
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

function sheet(cols: number, rows: number, poseAt: (c: number, r: number) => Pose | null, labelAt: (c: number, r: number) => string, base = COLOR): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(cell(labelAt(c, r), poseAt(c, r), c, r, base));
  }
  const w = cols * CELL, h = rows * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}


/* ---- U 忘却之影 ---- */
const SHADE_W: Pose = { lean: -.08, crouch: 4, look: .3, armF: [-1.7, -.2], armB: [-.35, .3], legF: [.35, 0], legB: [-.3, 0] };
const SHADE_H: Pose = { lean: .2, crouch: 16, look: .5, armF: [1.5, .1], armB: [-.9, -.3], legF: [.95, -.85], legB: [-.7, .45], ox: -12 };
const SHADE_R: Pose = { lean: 0, crouch: 0, look: .3, neck: -.1, armF: [.3, 1.2], armB: [.2, .4], legF: [.2, 0], legB: [-.2, 0] };
/* ---- I 神威 ---- */
const STOMP_W: Pose = { lean: -.06, crouch: 0, look: .3, armF: [.55, .15], armB: [.45, .2], legF: [1.25, -1.3], legB: [-.05, 0] };
const STOMP_H: Pose = { lean: 0, crouch: 6, look: .2, neck: .1, armF: [.95, .25], armB: [-.95, -.25], legF: [.35, 0], legB: [-.3, 0] };
const STOMP_R: Pose = { lean: -.03, crouch: 0, look: .25, neck: -.12, armF: [.35, 1.9], armB: [.25, 2.0], legF: [.12, 0], legB: [-.12, 0] };
/* ---- O 双月轮舞 ---- */
const MOON_W: Pose = { lean: .35, crouch: 10, look: .5, armF: [-.8, -.6], armB: [1.0, .6], legF: [.7, -.6], legB: [-.6, .4] };
const MOON_H: Pose = { lean: .6, crouch: 14, look: .55, neck: .35, armF: [-1.3, -.2], armB: [-1.1, -.3], legF: [.9, -.5], legB: [-1.0, .3], ox: -10 };
const MOON_R: Pose = { lean: -.2, crouch: 10, look: .3, armF: [1.2, .4], armB: [-.6, -.4], legF: [.9, -.2], legB: [-.8, .4], ox: -6 };
/* ---- L 血月的奏鸣 ---- */
const KEYS_W: Pose = { lean: -.05, crouch: 0, look: .4, keys: true, armF: [2.35, -.25], armB: [2.2, -.2], legF: [.2, 0], legB: [-.2, 0], ox: -26 };
const KEYS_H: Pose = { lean: .1, crouch: 3, look: .5, neck: .25, keys: true, armF: [1.0, .55], armB: [.9, .6], legF: [.2, 0], legB: [-.2, 0], ox: -26 };
const KEYS_R: Pose = { lean: .15, crouch: 3, look: .55, keys: true, armF: [1.3, .3], armB: [.7, .8], legF: [.25, 0], legB: [-.2, 0], ox: -26 };

const SPECIAL: Pose[][] = [
  [SHADE_W, SHADE_H, SHADE_R],
  [STOMP_W, STOMP_H, STOMP_R],
  [MOON_W, MOON_H, MOON_R],
  [KEYS_W, KEYS_H, KEYS_R],
];
/** The 白祥: standing quietly, hands folded in front, head tipped a little. */
const SHIRO_POSE: Pose = { lean: 0, crouch: 0, look: .25, neck: .12, armF: [.4, 1.7], armB: [.3, 1.8], legF: [.12, 0], legB: [-.12, 0] };

function commonPose(label: string): Pose | null {
  if (!label) return null;
  if (label in LOCO) return LOCO[label];
  const [name, phase] = label.split('-');
  const air = name.startsWith('air');
  const heavy = name.endsWith('Heavy') || name === 'heavy';
  const wind = heavy ? (air ? AIR_KICK_WIND : KICK_WIND) : (air ? JUMP : PUNCH_WIND);
  const hit = heavy ? (air ? AIR_KICK_HIT : KICK_HIT) : PUNCH_HIT;
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

/** A prop on a transparent cell: the figure only, no backdrop, grid or label. */
function shiroSvg(): string {
  const drawn = figure(SHIRO_POSE, SHIRO);
  for (const m of drawn.marks) {
    const p = cellPoint(SHIRO_POSE, m);
    const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
    if (over > 1) throw new Error(`shiro leaves the cell by ${over.toFixed(1)}px`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${drawn.svg}</svg>\n`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'sakiko');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* Placeholders until the img2img art comes in. Drop a name from this list once its finished art
   replaces it (SOP step 8); --replace is only for redrawing on purpose. */
const SHEETS: [string, string, number, number][] = [
  ['common.png', common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
  ['special.png', special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
  ['shiro.png', shiroSvg(), CELL, CELL],
];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote sakiko svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log(SHEETS.length ? 'wrote sakiko sheets' : 'sakiko sheets are finished art; nothing to rasterize');
}

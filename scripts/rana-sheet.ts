import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, isPlaceholderPng, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Rana: common sheet, special sheet, and the parfait prop (a lone #00FF00 tile).
   Do not import write-sheets.ts. Special columns are U 吉他激奏 (bent-over strum; the block is
   guitar-less on purpose — the img2img prompt paints the guitar into these cells from image 1),
   I 来去如风 (crouch / step-through / land), O 高踢腿 (chamber / vertical kick / settle),
   L 抹茶大芭菲 (present / arms spread / lower — the parfait itself is the external prop). */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean;
  /** Horizontal shift of the whole figure, so a cycle can travel inside the cell. */
  ox?: number;
  /** Head angle. Defaults to the spine, so a crawl can keep the chest low and the face up. */
  neck?: number;
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

/* U 吉他激奏: anon's strum read — a wide planted stance, the pick hand cocked high then swept
   down across the strings, the far hand holding the neck up — hung on a clearer forward bend. */
const RIFF_W: Pose = { lean: .12, crouch: 2, look: .45, armF: [-.35, -1.45], armB: [.4, 1.2], legF: [.62, .04], legB: [-.62, .04] };
const RIFF_H: Pose = { lean: .3, crouch: 4, look: .55, armF: [1.25, .4], armB: [.45, 1.25], legF: [.62, .04], legB: [-.62, .04] };
const RIFF_R: Pose = { lean: .16, crouch: 3, look: .5, armF: [.55, -.5], armB: [.42, 1.2], legF: [.62, .04], legB: [-.62, .04] };
/* I 来去如风: gather, step through the vanish, land back into the guard. */
const WIND_W: Pose = { lean: -.12, crouch: 10, armF: [-.7, -.7], armB: [-.5, -.6], legF: [.35, -.1], legB: [-.4, .2] };
const WIND_H: Pose = { lean: .45, crouch: 6, armF: [1.6, -.3], armB: [-1.1, -.5], legF: [1.05, -.3], legB: [-.85, .5], look: .5, ox: 4 };
const WIND_R: Pose = { lean: .1, crouch: 2, armF: [.6, .9], armB: [.3, 1.2], legF: [.3, 0], legB: [-.28, 0] };
/* O 高踢腿: knee chambered to the chest, then the foot swings past her own head. */
const HIKE_W: Pose = { lean: -.18, crouch: 6, armF: [-.6, -1.3], armB: [1.1, -.8], legF: [1.5, -1.9], legB: [-.15, 0], look: .45 };
const HIKE_H: Pose = { lean: -.35, crouch: 2, armF: [-1.5, -.5], armB: [2.0, -.4], legF: [2.65, -.25], legB: [-.1, 0], look: .5 };
const HIKE_R: Pose = { lean: .1, crouch: 4, armF: [.7, .5], armB: [.4, .4], legF: [.5, -.1], legB: [-.3, 0] };
/* L 抹茶大芭菲: both hands lower it, arms fling wide, then everything comes down. */
const SERVE_W: Pose = { lean: .15, crouch: 8, armF: [1.35, .35], armB: [1.15, .5], legF: [.4, -.1], legB: [-.35, .15], look: .35 };
const SERVE_H: Pose = { lean: -.05, crouch: 2, armF: [2.1, .2], armB: [-2.3, .15], legF: [.4, -.1], legB: [-.4, .1], look: .55 };
const SERVE_R: Pose = { lean: .05, crouch: 3, armF: [1.0, .6], armB: [-.9, .5], legF: [.35, 0], legB: [-.3, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}

/* SVG stand-in only. Re-running this script redraws every sheet it owns. */
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
const COLOR = '#77DD77';

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
  [RIFF_W, RIFF_H, RIFF_R],
  [WIND_W, WIND_H, WIND_R],
  [HIKE_W, HIKE_H, HIKE_R],
  [SERVE_W, SERVE_H, SERVE_R],
];

/* The parfait and matcha props: lone #00FF00 cells, no grid, no label. */
function propSheet(inner: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#00FF00"/>${inner}</svg>\n`;
}

/** 抹茶熔岩: one dollop, dark crust, bright core — reads even at 56px. */
function matchaSvg(): string {
  const line = '#151222';
  const crust = '#3e7d46';
  const core = '#77DD77';
  const glint = '#f4f9ee';
  const cx = 128, cy = 128, r = 88;
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = r * (1 + Math.sin(a * 3 + 1) * .09 + Math.sin(a * 5) * .05);
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr * .94).toFixed(1)}`);
  }
  const drip = `<path d="M118 210 C114 232 142 234 140 214 C143 228 134 242 128 246 C122 242 116 226 118 210 Z" fill="${crust}" stroke="${line}" stroke-width="3"/>`;
  return propSheet(
    `<polygon points="${pts.join(' ')}" fill="${crust}" stroke="${line}" stroke-width="4" stroke-linejoin="round"/>` +
    `<circle cx="114" cy="120" r="44" fill="${core}"/>` +
    `<circle cx="162" cy="148" r="24" fill="${core}"/>` +
    `<circle cx="96" cy="160" r="20" fill="${core}"/>` +
    `<circle cx="100" cy="102" r="14" fill="${glint}"/>` +
    drip,
    CELL, CELL,
  );
}

function parfaitSvg(): string {
  const line = '#2a2438';
  const cream = '#f3edda';
  const matcha = '#7cb85c';
  const foam = '#fdfbf5';
  const band = (x1: number, x2: number, y1: number, y2: number, fill: string): string =>
    `<polygon points="${x1},${y1} ${x2},${y1} ${x2 - 4},${y2} ${x1 + 4},${y2}" fill="${fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">
  <rect width="${CELL}" height="${CELL}" fill="#00FF00"/>
  ${stroke(158, 80, 206, 26, 5, line)}
  <ellipse cx="210" cy="20" rx="10" ry="7" fill="#c9c4b8" stroke="${line}" stroke-width="2"/>
  <polygon points="66,64 190,64 172,236 84,236" fill="#f8f6ef" stroke="${line}" stroke-width="3"/>
  ${band(72, 184, 92, 128, cream)}
  ${band(76, 180, 128, 164, matcha)}
  ${band(80, 176, 164, 200, cream)}
  ${band(84, 172, 200, 232, matcha)}
  <circle cx="104" cy="62" r="18" fill="${foam}" stroke="${line}" stroke-width="2"/>
  <circle cx="128" cy="54" r="17" fill="${foam}" stroke="${line}" stroke-width="2"/>
  <circle cx="152" cy="62" r="15" fill="${foam}" stroke="${line}" stroke-width="2"/>
  ${stroke(128, 24, 136, 8, 3, line)}
  <circle cx="126" cy="34" r="11" fill="#d9536f" stroke="${line}" stroke-width="2"/>
</svg>\n`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'rana');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* Only files that are still missing or placeholder-stamped get rastered; finished art is never touched. */
const outs: [string, () => string, number, number][] = [
  [join(dir, 'common.png'), () => common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
  [join(dir, 'special.png'), () => special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
  [join(dir, 'parfait.png'), () => parfaitSvg(), CELL, CELL],
  [join(dir, 'matcha.png'), () => matchaSvg(), CELL, CELL],
];
const writable = outs.filter(([p]) => !existsSync(p) || isPlaceholderPng(readFileSync(p)));
assertAllWritable(writable.map(([p]) => p));
for (const [p, svg, w, h] of writable) rasterSheet(p, svg(), w, h);
console.log(`wrote ${writable.length} of ${outs.length} rana files`);

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Mana only. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. Special columns: the donut (cock back, toss,
   settle), the crown (mic grip, sing out, clasp — the cells the wave loop cycles), the wink
   (gather, hook the leg and blow the kiss, stand back), and the world cast (wave, finger heart,
   arms wide). The world sheet is the dedicated dance table: row 0 the beats, row 1 the fancier
   beats, row 2 only the pulse hold. Donuts and the heart are separate props. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
}

const IDLE: Pose = { lean: 0, crouch: 0, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
const BLOCK: Pose = { lean: -.05, crouch: 8, armF: [1.1, 1.5], armB: [.9, 1.7], legF: [.35, 0], legB: [-.2, 0] };
const HURT: Pose = { lean: -.3, crouch: 4, look: -.15, armF: [-.6, -.4], armB: [-.9, -.3], legF: [.4, 0], legB: [-.3, 0] };
const LYING: Pose = { ...HURT, crouch: 0, legF: [.1, 0], legB: [-.1, 0], lying: true };
const JUMP: Pose = { lean: .05, crouch: 0, armF: [2.4, -.4], armB: [-1.2, -.6], legF: [.9, -1.4], legB: [.3, -1.0] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };
const PUNCH_WIND: Pose = { lean: -.08, crouch: 2, armF: [-.4, -1.9], armB: [.9, -1.6], legF: [.3, 0], legB: [-.3, 0] };
const PUNCH_HIT: Pose = { lean: .15, crouch: 2, look: .58, armF: [1.57, 0], armB: [.5, -1.8], legF: [.5, 0], legB: [-.4, 0] };
const KICK_WIND: Pose = { lean: -.1, crouch: 4, armF: [.5, -1.6], armB: [.8, -1.4], legF: [-.5, .8], legB: [0, 0] };
const KICK_HIT: Pose = { lean: -.25, crouch: 0, look: .5, armF: [-.3, -1.2], armB: [1.0, -1.2], legF: [1.5, .2], legB: [-.1, 0] };
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };

/* U: the donut. Cocked back across the body, the underhand toss, the settle. The donut flies alone. */
const DONUT_W: Pose = { lean: -.06, crouch: 2, look: .4, armF: [-1.15, -1.55], armB: [.35, 1.65], legF: [.25, 0], legB: [-.28, 0] };
const DONUT_H: Pose = { lean: .16, crouch: 2, look: .55, armF: [1.5, .05], armB: [-1.05, -.45], legF: [.55, -.15], legB: [-.45, .25] };
const DONUT_R: Pose = { lean: .02, crouch: 1, look: .4, armF: [.55, 1.7], armB: [.25, 1.85], legF: [.3, 0], legB: [-.28, 0] };
/* I: the crown. Mic grip, sing out with one arm high, hands clasped — cycled per wave. */
const CROWN_W: Pose = { lean: 0, crouch: 2, look: .45, armF: [-.35, 2.25], armB: [.4, 2.1], legF: [.28, 0], legB: [-.26, 0] };
const CROWN_H: Pose = { lean: -.1, crouch: 0, look: .55, armF: [2.45, .35], armB: [-1.75, -.4], legF: [.45, -.1], legB: [-.4, .2] };
const CROWN_R: Pose = { lean: .04, crouch: 1, look: .45, armF: [.5, 2.0], armB: [.45, 1.9], legF: [.26, 0], legB: [-.24, 0] };
/* O: the wink. Hand gathered at the hip, then the hooked leg and the kiss, then stand back. */
const WINK_W: Pose = { lean: .04, crouch: 4, look: .4, armF: [-.55, -1.7], armB: [.4, 1.6], legF: [.3, 0], legB: [-.3, 0] };
const WINK_H: Pose = { lean: .32, crouch: 7, look: .55, armF: [1.45, -.25], armB: [-1.35, .75], legF: [1.05, -1.85], legB: [-.18, .05] };
const WINK_R: Pose = { lean: 0, crouch: 1, look: .4, armF: [.5, 1.75], armB: [.3, 1.9], legF: [.28, 0], legB: [-.26, 0] };
/* L column: the world cast — wave, finger heart, arms wide. */
const WORLD_W: Pose = { lean: -.06, crouch: 0, look: .5, armF: [2.65, .35], armB: [.3, 1.45], legF: [.32, 0], legB: [-.3, 0] };
const WORLD_H: Pose = { lean: .08, crouch: 2, look: .5, armF: [.85, 1.7], armB: [-.45, -1.55], legF: [.35, 0], legB: [-.3, 0] };
const WORLD_R: Pose = { lean: -.08, crouch: 0, look: .5, armF: [1.95, .2], armB: [-1.95, -.2], legF: [.42, -.1], legB: [-.42, .18] };

/* The dance sheet. Row 0 beats, row 1 fancier beats, row 2 only the pulse hold. */
const D_STEP: Pose = { lean: .08, crouch: 3, look: .5, armF: [.85, .95], armB: [-.75, .8], legF: [.55, -.15], legB: [-.5, .2] };
const D_HEART: Pose = { lean: 0, crouch: 1, look: .45, armF: [2.15, 1.25], armB: [1.95, 1.4], legF: [.22, 0], legB: [-.2, 0] };
const D_TWIST: Pose = { lean: -.12, crouch: 4, look: .4, armF: [.6, 1.5], armB: [-1.25, .55], legF: [.18, -.35], legB: [-.38, .25] };
const D_WAVE: Pose = { lean: .07, crouch: 2, look: .5, armF: [2.5, .45], armB: [-.5, .95], legF: [.38, -.05], legB: [-.32, .12] };
const D_JUMP: Pose = { lean: -.05, crouch: 0, look: .5, armF: [2.3, .3], armB: [1.9, .5], legF: [.95, -1.3], legB: [.25, -1.0] };
const D_TWIRL: Pose = { lean: .12, crouch: 5, look: .5, armF: [1.7, .25], armB: [-1.6, -.3], legF: [.65, -.85], legB: [-.5, .3] };
const D_ARMS: Pose = { lean: -.1, crouch: 0, look: .55, armF: [2.15, .15], armB: [-2.15, -.15], legF: [.5, -.2], legB: [-.48, .22] };
const D_HOLD: Pose = { lean: .14, crouch: 6, look: .55, armF: [1.25, 1.35], armB: [1.05, 1.45], legF: [.48, -.3], legB: [-.38, .22] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying, look: b.look,
  };
}

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

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#BB9955';
const PINK = '#f2a2b8';
const PINK_HOT = '#ff5f9e';
const CHOC = '#8a5230';

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
  const bend = pose.crouch * .03;
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
  for (const pt of shell) marks.push({ x: pt.x, y: pt.y, r: 0 });
  const r = d.headR * s;
  const cx = shoulder.x + Math.sin(pose.lean) * (r + NECK * s);
  const cy = shoulder.y - Math.cos(pose.lean) * (r + NECK * s);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${light}"/>`);
  const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .28 + pose.lean));
  const ex = cx + r * gaze, ey = cy - r * .08, er = Math.max(2.4, r * .42);
  parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="${(ex + er * .35).toFixed(1)}" cy="${(ey - er * .2).toFixed(1)}" r="${(er * .38).toFixed(1)}" fill="${light}"/>`);
  marks.push({ x: cx, y: cy, r: r + 2 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2},${CELL - FOOT})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + m.x, y: CELL - FOOT + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

const overflows: string[] = [];

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const pt = cellPoint(pose, m);
      const over = Math.max(-pt.x + pt.r, pt.x + pt.r - CELL, -pt.y + pt.r, pt.y + pt.r - CELL);
      if (over > 1) overflows.push(`${label} leaves the cell by ${over.toFixed(1)}px at (${pt.x.toFixed(0)},${pt.y.toFixed(0)}) r=${pt.r.toFixed(1)}`);
    }
    if (!pose.lying) {
      const top = Math.min(...drawn.marks.map(m => {
        const pt = cellPoint(pose, m);
        return pt.y - pt.r;
      }));
      const height = CELL - FOOT - top;
      if (height < CELL * .45) overflows.push(`${label} is only ${Math.round(height)}px tall`);
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
  if (overflows.length) throw new Error(overflows.join('\n'));
  const w = cols * CELL, h = rows * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}

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

const SPECIAL: Pose[][] = [
  [DONUT_W, DONUT_H, DONUT_R],
  [CROWN_W, CROWN_H, CROWN_R],
  [WINK_W, WINK_H, WINK_R],
  [WORLD_W, WORLD_H, WORLD_R],
];

const WORLD: (Pose | null)[][] = [
  [D_STEP, D_HEART, D_TWIST, D_WAVE],
  [D_JUMP, WINK_H, D_TWIRL, D_ARMS],
  [D_HOLD, null, null, null],
];

/* Props on bare green: the hole and the background are the same chroma, cut at runtime. */
function donut(straw: boolean): string {
  const fill = straw ? PINK : CHOC;
  const sprinkles = straw
    ? [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = i * .79 + .4, rr = 60 + (i % 2) * 8;
        const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr;
        const col = ['#fff2f8', '#ffd27a', '#8ad4ff'][i % 3];
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="14" height="5" rx="2" fill="${col}" transform="rotate(${(a * 57 + 40).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      }).join('')
    : [0, 1, 2].map(i =>
        `<path d="M ${70 + i * 30} 84 q 14 22 0 44" fill="none" stroke="#5a3319" stroke-width="6" stroke-linecap="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">` +
    `<circle cx="128" cy="128" r="92" fill="${fill}" stroke="${OUTLINE}" stroke-width="5"/>` +
    `<circle cx="128" cy="128" r="34" fill="#00FF00"/>` +
    sprinkles +
    `</svg>\n`;
}

function heartProp(): string {
  const s = 78;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">` +
    `<path d="M 128 ${128 + s * .62} C ${128 - s * 1.05} ${128 - s * .22}, ${128 - s * .42} ${128 - s}, 128 ${128 - s * .38} C ${128 + s * .42} ${128 - s}, ${128 + s * 1.05} ${128 - s * .22}, 128 ${128 + s * .62} Z" fill="${PINK_HOT}" stroke="#ffd9ec" stroke-width="6"/>` +
    `<circle cx="94" cy="82" r="13" fill="#ffd9ec" opacity=".85"/>` +
    `</svg>\n`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'mana');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const world = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => WORLD[r][c], (c, r) => WORLD[r][c] ? ['step', 'heart', 'twist', 'wave', 'jump', 'wink', 'twirl', 'arms', 'hold'][r * 4 + c] : '');
/* common/special/world are finished art (mark gone) and left the raster list, per SOP.
   The donut hole stays a #00FF00 fill on purpose — keyed() punches it out at runtime. */
const targets = ['donut-straw.png', 'donut-choc.png', 'heart.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'donut-straw.png'), donut(true), CELL, CELL);
rasterSheet(join(dir, 'donut-choc.png'), donut(false), CELL, CELL);
rasterSheet(join(dir, 'heart.png'), heartProp(), CELL, CELL);
console.log('wrote mana sheets');

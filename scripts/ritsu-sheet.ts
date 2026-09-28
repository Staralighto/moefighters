import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';
import { RIB_OX, SKEWER_OX, STEAK_OX } from '../src/render/ritsuSheet.ts';

/* Colour-block Minetsuki Ritsu. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. The four special columns are the meat slam,
   the skewer lunge, the bite, and hands on the waist. No hair or costume on the blocks.
   Food is oversized and aimed to screen-right. RIB_OX / SKEWER_OX / STEAK_OX shift the body
   left inside the cell; clipFor hands the same numbers back so playback undoes the shift. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
  /** Open mouth on the bite frame. */
  bite?: boolean;
  /** U column: tomahawk steak continuing out of the front hand. */
  rib?: boolean;
  /** I column: a short skewer continuing out of the front hand. */
  skewer?: boolean;
  /** O column: a steak. 'hand' follows the front hand, 'mouth' sits at the face. */
  steak?: 'hand' | 'mouth';
  ox?: number;
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

/* U 超级带骨肉: the chop is half her height and points screen-right, into the gap the ox opens. */
const RIB_W: Pose = { lean: -.12, crouch: 14, look: .35, armF: [2.05, -.4], armB: [-.7, -.3], legF: [.28, 0], legB: [-.32, 0], rib: true, ox: RIB_OX[0] };
const RIB_H: Pose = { lean: .28, crouch: 12, look: .55, armF: [1.2, .08], armB: [-.45, -.5], legF: [.55, 0], legB: [-.62, .2], rib: true, ox: RIB_OX[1] };
const RIB_R: Pose = { lean: .06, crouch: 6, look: .4, armF: [.95, .22], armB: [.1, -1.1], legF: [.35, 0], legB: [-.4, 0], rib: true, ox: RIB_OX[2] };

/* I 肉串刺击: the stick stays aimed right on every frame so the length uses the same gap. */
const SKEWER_W: Pose = { lean: -.14, crouch: 6, look: .4, armF: [1.9, -.5], armB: [.55, -1.3], legF: [.25, 0], legB: [-.4, 0], skewer: true, ox: SKEWER_OX[0] };
const SKEWER_H: Pose = { lean: .26, crouch: 6, look: .58, armF: [1.55, 0], armB: [-.65, -.45], legF: [.72, 0], legB: [-.68, .15], skewer: true, ox: SKEWER_OX[1] };
const SKEWER_R: Pose = { lean: .04, crouch: 3, look: .4, armF: [1.15, .28], armB: [.15, -1.05], legF: [.38, 0], legB: [-.35, 0], skewer: true, ox: SKEWER_OX[2] };

/* O 大份牛排: a large cut, still aimed right except the bite which sits at the mouth. */
const STEAK_W: Pose = { lean: -.04, crouch: 4, look: .45, armF: [1.35, .15], armB: [.35, -1.2], legF: [.28, 0], legB: [-.28, 0], steak: 'hand', ox: STEAK_OX[0] };
const STEAK_H: Pose = { lean: .02, crouch: 3, look: .5, armF: [1.7, 1.2], armB: [.3, -1.15], legF: [.28, 0], legB: [-.28, 0], steak: 'mouth', bite: true, ox: STEAK_OX[1] };
const STEAK_R: Pose = { lean: 0, crouch: 2, look: .35, armF: [1.1, .25], armB: [.25, -1.3], legF: [.28, 0], legB: [-.28, 0], steak: 'hand', ox: STEAK_OX[2] };

/* L 超恢复: elbows out, hands down on the waist, then held. No prop. */
const FEAST_W: Pose = { lean: -.02, crouch: 2, look: .4, armF: [.7, -.35], armB: [-.55, .3], legF: [.28, 0], legB: [-.28, 0] };
const FEAST_H: Pose = { lean: 0, crouch: 3, look: .4, armF: [1.25, -1.15], armB: [-1.25, 1.15], legF: [.32, 0], legB: [-.3, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    look: b.look,
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
/** Her member colour. */
const COLOR = '#4477CC';
const MEAT = '#c45648';
const BONE = '#f4ead8';

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

function outline(pts: Pt[], parts: string[]): void {
  parts.push(`<polygon points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>`);
}

/** Point `dist` along angle `th`, offset `side` to the left of that direction. */
function at(h: Pt, th: number, dist: number, side: number): Pt {
  return {
    x: h.x + Math.sin(th) * dist + Math.cos(th) * side,
    y: h.y + Math.cos(th) * dist - Math.sin(th) * side,
  };
}

function handOf(shoulder: Pt, arm: Limb, d: { upperArm: number; foreArm: number }, s: number): { p: Pt; th: number } {
  const [a1, a2] = arm;
  const th = a1 + a2;
  return {
    p: {
      x: shoulder.x + Math.sin(a1) * d.upperArm * s + Math.sin(th) * d.foreArm * s,
      y: shoulder.y + Math.cos(a1) * d.upperArm * s + Math.cos(th) * d.foreArm * s,
    },
    th,
  };
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
  if (pose.bite) parts.push(`<ellipse cx="${(cx + r * gaze * .8).toFixed(1)}" cy="${(cy + r * .55).toFixed(1)}" rx="${(r * .22).toFixed(1)}" ry="${(r * .28).toFixed(1)}" fill="${OUTLINE}"/>`);
  marks.push({ x: cx, y: cy, r: r + 2 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  const hand = handOf(shoulder, pose.armF, d, s);
  const mark = (pts: Pt[], rad = 2) => { for (const pt of pts) marks.push({ x: pt.x, y: pt.y, r: rad }); };
  const standing = legLen + torsoH + (NECK + d.headR * 2) * s + 2;
  if (pose.rib) {
    // Whole tomahawk is half her standing height. Bone handle, thick chop, polygon not an oval.
    const len = standing * .5;
    const meatW = standing * .12;
    const bone = [at(hand.p, hand.th, 0, 5), at(hand.p, hand.th, 0, -5), at(hand.p, hand.th, len * .3, -5), at(hand.p, hand.th, len * .3, 5)];
    const meat = [
      at(hand.p, hand.th, len * .24, meatW * .45), at(hand.p, hand.th, len * .4, meatW), at(hand.p, hand.th, len * .82, meatW * .9),
      at(hand.p, hand.th, len, 0), at(hand.p, hand.th, len * .76, -meatW), at(hand.p, hand.th, len * .32, -meatW * .7),
    ];
    parts.push(poly(bone, BONE));
    outline(bone, parts);
    parts.push(poly(meat, MEAT));
    outline(meat, parts);
    mark([...bone, ...meat]);
  }
  if (pose.skewer) {
    const len = standing * .44;
    const chunk = standing * .045;
    const stick = [at(hand.p, hand.th, 0, 2.2), at(hand.p, hand.th, 0, -2.2), at(hand.p, hand.th, len, -2.2), at(hand.p, hand.th, len, 2.2)];
    parts.push(poly(stick, BONE));
    outline(stick, parts);
    mark(stick);
    for (const u of [.22, .46, .7, .9]) {
      const dist = len * u;
      const bit = [
        at(hand.p, hand.th, dist - chunk, chunk * 1.3), at(hand.p, hand.th, dist + chunk, chunk * 1.3),
        at(hand.p, hand.th, dist + chunk, -chunk * 1.3), at(hand.p, hand.th, dist - chunk, -chunk * 1.3),
      ];
      parts.push(poly(bit, MEAT));
      outline(bit, parts);
      mark(bit);
    }
  }
  if (pose.steak === 'hand' || pose.steak === 'mouth') {
    const len = standing * .34;
    const meatW = standing * .1;
    const origin = pose.steak === 'mouth' ? { x: cx + r * .55, y: cy + r * .2 } : hand.p;
    const th = pose.steak === 'mouth' ? 1.15 : hand.th;
    const meat = [
      at(origin, th, len * .08, meatW * .4), at(origin, th, len * .28, meatW), at(origin, th, len * .78, meatW * .75),
      at(origin, th, len, 0), at(origin, th, len * .62, -meatW * .85), at(origin, th, len * .16, -meatW * .45),
    ];
    parts.push(poly(meat, MEAT));
    outline(meat, parts);
    mark(meat);
  }
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

const overflows: string[] = [];

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const pt = cellPoint(pose, m);
      const sides = { left: -pt.x + pt.r, right: pt.x + pt.r - CELL, top: -pt.y + pt.r, bottom: pt.y + pt.r - CELL };
      const worst = Object.entries(sides).sort((a, b) => b[1] - a[1])[0];
      if (worst[1] > 1 && !overflows.some(line => line.startsWith(label))) overflows.push(`${label} leaves the cell by ${worst[1].toFixed(1)}px on the ${worst[0]}`);
    }
    if (!pose.lying) {
      const top = Math.min(...drawn.marks.map(m => {
        const pt = cellPoint(pose, m);
        return pt.y - pt.r;
      }));
      const height = CELL - FOOT - top;
      if (height < CELL * .45) throw new Error(`${label} is drawn to the old 128 spec (${Math.round(height)}px tall in a ${CELL} cell)`);
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
  [RIB_W, RIB_H, RIB_R],
  [SKEWER_W, SKEWER_H, SKEWER_R],
  [STEAK_W, STEAK_H, STEAK_R],
  [FEAST_W, FEAST_H, FEAST_H],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'ritsu');

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);

const targets = ['common.png', 'special.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote ritsu common/special sheets');

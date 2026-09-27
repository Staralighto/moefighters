import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, isPlaceholderPng, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';
import { YOKAN_OX } from '../src/render/miyakoSheet.ts';

/* Colour-block Fuji Miyako. Do not import write-sheets.ts — that script redraws the whole cast.
   The yokan is a held block on the U column only. The magic circle is a flying effect, not a cell. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
  roar?: boolean;
  /** U column: a rectangular yokan continues out of the front hand. */
  yokan?: boolean;
  /** I column: a knuckle blob at each hand so the chambered hikite reads as a fist. */
  fist?: boolean;
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

/* U 巨羊羹砸击: the block is hauled up behind her, swung down across the front, then left nose-down
   on the floor. The bar is longer than half a cell, so each frame borrows its own ox from YOKAN_OX. */
const YOKAN_W: Pose = { lean: -.2, crouch: 4, look: .2, armF: [-1.5, -.5], armB: [-.9, -.3], legF: [.22, .13], legB: [-.5, .46], yokan: true, ox: YOKAN_OX[0] };
const YOKAN_H: Pose = { lean: .28, crouch: 10, look: .55, armF: [1.1, -.15], armB: [-.4, -.5], legF: [.32, .2], legB: [-.82, .72], yokan: true, ox: YOKAN_OX[1] };
const YOKAN_R: Pose = { lean: .08, crouch: 5, look: .4, armF: [.85, -.25], armB: [.2, -1.2], legF: [.27, .07], legB: [-.51, .37], yokan: true, ox: YOKAN_OX[2] };

/* I 秋叶原马拉松: hikite. The elbow drives back past the ribs and the fist lands on the floating rib,
   just above the belt — fists travel in, plant in a deep stance, then the crouch eases off them. */
const RUN_W: Pose = { lean: .04, crouch: 6, look: .45, armF: [-.47, 1.84], armB: [-.61, 1.71], legF: [.26, .17], legB: [-.58, .45], fist: true };
const RUN_H: Pose = { lean: .02, crouch: 14, look: .5, armF: [-.73, 1.63], armB: [-.78, 1.37], legF: [.3, .42], legB: [-1.04, .99], fist: true };
const RUN_R: Pose = { lean: .06, crouch: 9, look: .48, armF: [-.71, 1.74], armB: [-.79, 1.52], legF: [.29, .25], legB: [-.75, .62], fist: true };

/* O 满月嚎叫: head back, then the shout, then the mouth closes. */
const HOWL_W: Pose = { lean: -.22, crouch: 2, look: -.05, armF: [1.4, .4], armB: [-.5, -.2], legF: [.28, 0], legB: [-.28, 0] };
const HOWL_H: Pose = { lean: -.32, crouch: 0, look: -.12, armF: [2.15, .15], armB: [-.9, -.15], legF: [.3, 0], legB: [-.25, 0], roar: true };
const HOWL_R: Pose = { lean: -.08, crouch: 2, look: .35, armF: [1.2, .9], armB: [-.2, -.3], legF: [.28, 0], legB: [-.28, 0] };

/* L 九字真言 (kuji-kiri): both arms haul back low to gather, the sword hand cuts to a high extreme
   above the head while the other chambers, then both thrust out level. The grid is not drawn. */
const SEAL_W: Pose = { lean: .02, crouch: 5, look: .4, armF: [-1.15, -.05], armB: [-1.35, -.1], legF: [.25, .13], legB: [-.51, .37] };
const SEAL_H: Pose = { lean: -.06, crouch: 4, look: .55, armF: [2.45, -.1], armB: [-.5, 1.3], legF: [.24, .08], legB: [-.46, .35] };
const SEAL_R: Pose = { lean: .16, crouch: 8, look: .58, armF: [1.57, 0], armB: [1.45, .12], legF: [.31, .13], legB: [-.7, .58] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    look: b.look, roar: b.roar, yokan: b.yokan, ox: b.ox,
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
/** Official image colour. The yokan is a separate brown so the block reads as a prop. */
const COLOR = '#9977CC';
const YOKAN = '#6b3a22';

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
    return end;
  };
  const fistR = d.limb * s * 1.45;
  const fist = (p: Pt, col: string) => {
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(fistR + 2).toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${fistR.toFixed(1)}" fill="${col}"/>`);
    marks.push({ x: p.x, y: p.y, r: fistR + 2 });
  };
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  const backHand = limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  if (pose.fist) fist(backHand, dark);
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
  if (pose.roar) parts.push(`<ellipse cx="${(cx + r * gaze * .8).toFixed(1)}" cy="${(cy + r * .55).toFixed(1)}" rx="${(r * .24).toFixed(1)}" ry="${(r * .36).toFixed(1)}" fill="${OUTLINE}"/>`);
  marks.push({ x: cx, y: cy, r: r + 2 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  const hand = limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.fist) fist(hand, COLOR);
  if (pose.yokan) {
    const [a1, a2] = pose.armF;
    const th = a1 + a2;
    const dx = Math.sin(th), dy = Math.cos(th);
    const px = Math.cos(th), py = -Math.sin(th);
    /* Two-thirds of the standing figure — legs, torso, neck, head and the outline pad — so the
       block reads as absurdly large. Its reach is what forces the per-frame ox in YOKAN_OX. */
    const standing = legLen + torsoH + (NECK + d.headR * 2) * s + 2;
    const len = standing * (2 / 3), half = 14;
    const box = [
      { x: hand.x + px * half, y: hand.y + py * half },
      { x: hand.x - px * half, y: hand.y - py * half },
      { x: hand.x + dx * len - px * half, y: hand.y + dy * len - py * half },
      { x: hand.x + dx * len + px * half, y: hand.y + dy * len + py * half },
    ];
    parts.push(poly(box, YOKAN));
    parts.push(`<polygon points="${box.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>`);
    for (const pt of box) marks.push({ x: pt.x, y: pt.y, r: 2 });
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

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const pt = cellPoint(pose, m);
      const over = Math.max(-pt.x + pt.r, pt.x + pt.r - CELL, -pt.y + pt.r, pt.y + pt.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px`);
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
  [YOKAN_W, YOKAN_H, YOKAN_R],
  [RUN_W, RUN_H, RUN_R],
  [HOWL_W, HOWL_H, HOWL_R],
  [SEAL_W, SEAL_H, SEAL_R],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'miyako');

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);

/* 九字真言: a lone 256 cell the user replaces. Kept off the pose-sheet batch so a finished
   circle does not block regenerating the stick figures, and a finished pose sheet does not
   block rewriting this placeholder. */
const sealPath = join(dir, 'seal.png');
const sealSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="#00FF00"/><circle cx="128" cy="128" r="108" fill="none" stroke="#9977CC" stroke-width="14"/><circle cx="128" cy="128" r="78" fill="none" stroke="#cbb6ee" stroke-width="6"/><polygon points="128,58 166.5,176.6 66.2,103.4 189.8,103.4 89.5,176.6" fill="none" stroke="#e6d4ff" stroke-width="8" stroke-linejoin="round"/></svg>\n`;
if (!existsSync(sealPath) || isPlaceholderPng(readFileSync(sealPath))) {
  rasterSheet(sealPath, sealSvg, CELL, CELL);
  console.log('wrote miyako seal');
}

const targets = ['common.png', 'special.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote miyako common/special sheets');

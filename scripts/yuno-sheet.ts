import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Yuno only. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. Special columns are the deck sway, the
   meat throw, the frantic mash, and the still open-armed cast. The deck sits in the U and O
   cells as a tilted side view. Meat and notes stay separate props. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; deck?: boolean;
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

/* U: both hands stay in front. The three frames are the sway. */
const GROOVE_W: Pose = { lean: -.04, crouch: 2, look: .35, armF: [1.15, .35], armB: [.95, .7], legF: [.22, 0], legB: [-.2, 0], deck: true };
const GROOVE_H: Pose = { lean: .02, crouch: 1, look: .4, armF: [1.35, -.1], armB: [1.15, .15], legF: [.22, 0], legB: [-.2, 0], deck: true };
const GROOVE_R: Pose = { lean: -.02, crouch: 3, look: .35, armF: [1.0, .75], armB: [.85, 1.05], legF: [.22, 0], legB: [-.2, 0], deck: true };
/* I: chamber, throw, follow-through. The meat itself is a projectile. */
const MEAT_W: Pose = { lean: -.12, crouch: 4, look: .4, armF: [-.55, -1.5], armB: [.45, -1.2], legF: [.2, 0], legB: [-.35, 0] };
const MEAT_H: Pose = { lean: .16, crouch: 2, look: .55, armF: [1.55, 0], armB: [.25, -1.35], legF: [.5, 0], legB: [-.45, 0] };
const MEAT_R: Pose = { lean: .04, crouch: 2, look: .4, armF: [.35, 1.15], armB: [.15, -1.05], legF: [.28, 0], legB: [-.28, 0] };
/* O: lower and busier than the sway, so the two deck columns do not read as one move. */
const MASH_W: Pose = { lean: .08, crouch: 14, look: .45, armF: [.7, -1.05], armB: [.45, 1.35], legF: [.3, 0], legB: [-.25, 0], deck: true };
const MASH_H: Pose = { lean: .12, crouch: 16, look: .5, armF: [1.35, .85], armB: [.55, 1.45], legF: [.32, 0], legB: [-.22, 0], deck: true };
const MASH_R: Pose = { lean: .06, crouch: 12, look: .4, armF: [.45, 1.4], armB: [1.25, -.15], legF: [.28, 0], legB: [-.24, 0], deck: true };
/* L: a still open stance. The hit frame holds through the recover. */
const OPEN_W: Pose = { lean: -.02, crouch: 2, look: .35, armF: [.55, -1.2], armB: [.3, 1.45], legF: [.24, 0], legB: [-.22, 0] };
const OPEN_H: Pose = { lean: 0, crouch: 0, look: .45, armF: [1.15, -1.25], armB: [-.95, .35], legF: [.26, 0], legB: [-.24, 0] };

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
const COLOR = '#EE5577';

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
  if (pose.deck) {
    const reach = (spec: Limb): Pt => {
      const mid = { x: shoulder.x + Math.sin(spec[0]) * d.upperArm * s, y: shoulder.y + Math.cos(spec[0]) * d.upperArm * s };
      return { x: mid.x + Math.sin(spec[0] + spec[1]) * d.foreArm * s, y: mid.y + Math.cos(spec[0] + spec[1]) * d.foreArm * s };
    };
    const hf = reach(pose.armF), hb = reach(pose.armB);
    parts.push(deckShape((hf.x + hb.x) / 2 + 16, (hf.y + hb.y) / 2, marks));
  }
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
      if (over > 1) overflows.push(`${label} leaves the cell by ${over.toFixed(1)}px`);
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
  [GROOVE_W, GROOVE_H, GROOVE_R],
  [MEAT_W, MEAT_H, MEAT_R],
  [MASH_W, MASH_H, MASH_R],
  [OPEN_W, OPEN_H, OPEN_H],
];

/** Tilted side view: top face, near lip and one side, so the block is not a flat rectangle. */
function deckShape(cx: number, cy: number, marks: Mark[]): string {
  const top: Pt[] = [{ x: -52, y: -16 }, { x: 38, y: -26 }, { x: 56, y: -2 }, { x: -34, y: 8 }];
  const front: Pt[] = [{ x: -34, y: 8 }, { x: 56, y: -2 }, { x: 52, y: 12 }, { x: -38, y: 20 }];
  const side: Pt[] = [{ x: 38, y: -26 }, { x: 56, y: -2 }, { x: 52, y: 12 }, { x: 34, y: -10 }];
  const at = (pts: Pt[]) => pts.map(p => `${(cx + p.x).toFixed(1)},${(cy + p.y).toFixed(1)}`).join(' ');
  for (const p of [...top, ...front, ...side]) marks.push({ x: cx + p.x, y: cy + p.y, r: 2 });
  const platter = (ex: number, ey: number) => {
    marks.push({ x: cx + ex, y: cy + ey, r: 14 });
    return `<ellipse cx="${(cx + ex).toFixed(1)}" cy="${(cy + ey).toFixed(1)}" rx="13" ry="6.5" transform="rotate(-12 ${(cx + ex).toFixed(1)} ${(cy + ey).toFixed(1)})" fill="#1a1520" stroke="#EE5577" stroke-width="3"/>`;
  };
  return [
    `<polygon points="${at(side)}" fill="#1a1424" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
    `<polygon points="${at(front)}" fill="#2a2238" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
    `<polygon points="${at(top)}" fill="#241c30" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`,
    platter(-14, -6),
    platter(20, -12),
  ].join('');
}

function propSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${body}</svg>\n`;
}

const meat = propSvg(`
  <ellipse cx="118" cy="128" rx="52" ry="28" transform="rotate(24 118 128)" fill="#c44858" stroke="#151222" stroke-width="4"/>
  <line x1="108" y1="140" x2="168" y2="96" stroke="#f4ead8" stroke-width="10" stroke-linecap="round"/>
`);

const note = propSvg(`
  <rect x="132" y="48" width="10" height="90" fill="#EE5577"/>
  <ellipse cx="112" cy="142" rx="28" ry="16" transform="rotate(-28 112 142)" fill="#EE5577"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'yuno');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* common/special are finished art (mark gone) and left the raster list, per SOP. */
const targets = ['meat.png', 'note.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'meat.png'), meat, CELL, CELL);
rasterSheet(join(dir, 'note.png'), note, CELL, CELL);

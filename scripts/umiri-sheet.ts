import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Umiri only. Do not import write-sheets.ts — that script redraws the whole cast.
   ponytail: the bass is one polygon on the fear column. Ceiling = CELL. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; bass?: boolean;
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
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };

const THROW_W: Pose = { lean: -.16, crouch: 3, armF: [-.7, -1.5], armB: [.35, 1.4], legF: [.28, 0], legB: [-.3, 0] };
const THROW_H: Pose = { lean: .18, crouch: 2, look: .5, armF: [1.15, -.7], armB: [.4, 1.2], legF: [.45, 0], legB: [-.35, 0] };
const THROW_R: Pose = { lean: .04, crouch: 1, armF: [.7, .4], armB: [.3, 1.5], legF: [.24, 0], legB: [-.2, 0] };
const BAG_W: Pose = { lean: -.08, crouch: 2, armF: [-.85, -1.15], armB: [-1.05, -.9], legF: [.24, 0], legB: [-.22, 0] };
const BAG_H: Pose = { lean: .1, crouch: 1, look: .45, armF: [1.05, -.9], armB: [.45, -1.15], legF: [.35, 0], legB: [-.22, 0] };
const BAG_R: Pose = { lean: .04, crouch: 1, armF: [.85, .55], armB: [.55, .7], legF: [.22, 0], legB: [-.18, 0] };
const BASS_W: Pose = { lean: .08, crouch: 2, bass: true, armF: [.9, -.9], armB: [.35, 1.15], legF: [.45, -.1], legB: [-.15, 0] };
const BASS_H: Pose = { lean: .02, crouch: 6, bass: true, look: .4, armF: [.85, .35], armB: [.4, 1.05], legF: [.35, 0], legB: [-.28, 0] };
const BASS_R: Pose = { lean: 0, crouch: 1, bass: true, armF: [.7, -.4], armB: [.35, 1.2], legF: [.22, 0], legB: [-.18, 0] };
const GRAB_W: Pose = { lean: .22, crouch: 4, armF: [1.05, -.35], armB: [.9, -.2], legF: [.5, -.1], legB: [-.25, 0] };
const GRAB_H: Pose = { lean: .34, crouch: 6, look: .55, armF: [1.35, .5], armB: [1.15, .62], legF: [.5, 0], legB: [-.3, .1] };
const SLAM_R: Pose = { lean: -.42, crouch: 8, look: -.05, armF: [-.9, .55], armB: [-1.15, .35], legF: [.15, 0], legB: [-.45, .15] };

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
const COLOR = '#335566';
const BODY = '#241c28';
const MAPLE = '#e6c48a';

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

const xy = (x: number, y: number): Pt => ({ x, y });
const BASS_BODY: Pt[] = [
  xy(-4, -8), xy(-12, -2), xy(-13, 8), xy(-6, 16), xy(6, 15), xy(13, 6), xy(11, -4), xy(5, -9),
];

function bassOf(shoulder: Pt): { svg: string; marks: Mark[] } {
  const place = { x: shoulder.x + 1, y: shoulder.y + 16, rot: 20, s: 0.62 };
  const rad = place.rot * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const map = (p: Pt): Pt => ({
    x: place.x + (p.x * cos - p.y * sin) * place.s,
    y: place.y + (p.x * sin + p.y * cos) * place.s,
  });
  const ends = [...BASS_BODY, xy(-2, -42), xy(3, -42)];
  const marks = ends.map(p => ({ ...map(p), r: 2 }));
  const svg = `<g transform="translate(${place.x.toFixed(1)},${place.y.toFixed(1)}) rotate(${place.rot}) scale(${place.s})">${[
    poly(BASS_BODY, BODY),
    `<polygon points="${BASS_BODY.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>`,
    `<rect x="-1.6" y="-2" width="6" height="3" fill="#111"/>`,
    `<rect x="-1.8" y="-34" width="3.6" height="26" fill="${MAPLE}" stroke="${OUTLINE}" stroke-width="1"/>`,
    `<polygon points="-1.8,-34 -5.2,-38 -4.6,-42 3.2,-42 1.8,-34" fill="${MAPLE}" stroke="${OUTLINE}" stroke-width="1" stroke-linejoin="round"/>`,
  ].join('')}</g>`;
  return { svg, marks };
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
  for (const p of shell) marks.push({ x: p.x, y: p.y, r: 0 });
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
  if (pose.bass) {
    const b = bassOf(shoulder);
    parts.push(b.svg);
    marks.push(...b.marks);
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
  const wind = heavy ? (air ? AIR_KICK_WIND : KICK_WIND) : (air ? JUMP : PUNCH_WIND);
  const hit = heavy ? (air ? AIR_KICK_HIT : KICK_HIT) : PUNCH_HIT;
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

const SPECIAL: Pose[][] = [
  [THROW_W, THROW_H, THROW_R],
  [BAG_W, BAG_H, BAG_R],
  [BASS_W, BASS_H, BASS_R],
  [GRAB_W, GRAB_H, SLAM_R],
];

function propSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="#00FF00"/>${body}</svg>\n`;
}

const milk = propSvg(`
  <rect x="46" y="28" width="36" height="64" rx="4" fill="#6b3a22" stroke="#151222" stroke-width="3"/>
  <rect x="50" y="34" width="28" height="14" fill="#f2efe6"/>
  <rect x="54" y="22" width="20" height="10" rx="2" fill="#d8d2c4" stroke="#151222" stroke-width="2"/>
`);

const bag = propSvg(`
  <path d="M34 48 H94 L84 104 H44 Z" fill="#335566" stroke="#151222" stroke-width="3"/>
  <path d="M46 48 V40 A18 16 0 0 1 82 40 V48" fill="none" stroke="#151222" stroke-width="3"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'umiri');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const targets = ['common.png', 'special.png', 'milk.png', 'bag.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'milk.png'), milk, CELL, CELL);
rasterSheet(join(dir, 'bag.png'), bag, CELL, CELL);
console.log('wrote umiri sheets');

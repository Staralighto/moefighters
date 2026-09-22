import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block Anon only. Do not import write-sheets.ts — that script redraws the whole cast.
   U sprint, I wide strum, O faces the camera, L grips an empty spin. Guitar, notes and the heart are separate images.
   ponytail: one front-view drawer for the wink column. Ceiling = CELL. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; ox?: number;
  front?: 'wink' | 'heart' | 'back';
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

const SPRINT_W: Pose = { lean: -.18, crouch: 8, look: .2, armF: [-.35, -.4], armB: [-.7, -.25], legF: [-.1, 0], legB: [.4, -.2] };
const SPRINT_H: Pose = { lean: .55, crouch: 6, look: .58, armF: [-1.05, -.45], armB: [-1.25, -.35], legF: [1.05, -.25], legB: [-.95, .5] };
const SPRINT_R: Pose = { lean: .16, crouch: 4, look: .4, armF: [-.25, -.35], armB: [.35, -.45], legF: [.65, -.1], legB: [-.3, .12] };

const STRUM_W: Pose = { lean: -.04, crouch: 0, look: .4, armF: [-.2, -1.35], armB: [.35, 1.15], legF: [.62, .04], legB: [-.62, .04] };
const STRUM_H: Pose = { lean: .06, crouch: 0, look: .5, armF: [1.15, .35], armB: [.4, 1.2], legF: [.62, .04], legB: [-.62, .04] };
const STRUM_R: Pose = { lean: .02, crouch: 0, look: .45, armF: [.45, -.7], armB: [.38, 1.15], legF: [.62, .04], legB: [-.62, .04] };

const SPIN_W: Pose = { lean: -.08, crouch: 2, look: .3, armF: [.15, -1.15], armB: [-.05, -1.05], legF: [.28, 0], legB: [-.22, 0] };
const SPIN_H: Pose = { lean: .02, crouch: 1, look: .45, armF: [.85, .55], armB: [.55, .85], legF: [.32, 0], legB: [-.28, 0] };
const SPIN_R: Pose = { lean: .04, crouch: 0, look: .4, armF: [.4, 1.15], armB: [.2, 1.35], legF: [.24, 0], legB: [-.2, 0] };

const FACE: Pose = { lean: 0, crouch: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    ox: lerp(a.ox ?? 0, b.ox ?? 0, k),
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
/* Body fills the 256 cell. 0.58 was the old 128-tall figure left in the middle of the cell. */
const SCALE = 1.16;
const FOOT = 12;
const COLOR = '#FF8899';

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
  const s = SCALE;
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
  const neck = pose.lean;
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

/** Facing the camera, same height as the side figures. Two eyes, so a flip still reads as a face. */
function frontAnon(phase: 'wink' | 'heart' | 'back'): { svg: string; marks: Mark[] } {
  const dark = shade(COLOR, .6);
  const light = shade(COLOR, 1.35);
  const parts: string[] = [];
  const marks: Mark[] = [];
  const mark = (x: number, y: number, r: number) => marks.push({ x, y, r });
  const bone = (x1: number, y1: number, x2: number, y2: number, w: number, c: string) => {
    parts.push(stroke(x1, y1, x2, y2, w + 2, OUTLINE));
    parts.push(stroke(x1, y1, x2, y2, w, c));
    mark(x1, y1, (w + 2) / 2);
    mark(x2, y2, (w + 2) / 2);
  };
  bone(122, 188, 116, 244, 3.2, dark);
  bone(134, 188, 140, 244, 3.2, COLOR);
  parts.push(`<rect x="118" y="156" width="20" height="34" rx="5" fill="${OUTLINE}"/>`);
  parts.push(`<rect x="120" y="158" width="16" height="30" rx="4" fill="${COLOR}"/>`);
  mark(118, 156, 2); mark(138, 156, 2); mark(118, 190, 2); mark(138, 190, 2);
  parts.push(`<circle cx="128" cy="142" r="12" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="128" cy="142" r="10" fill="${light}"/>`);
  mark(128, 142, 12);
  const eye = (x: number, open: boolean) => {
    if (open) parts.push(`<circle cx="${x}" cy="141" r="1.7" fill="${OUTLINE}"/>`);
    else parts.push(stroke(x - 3, 141, x + 3, 141, 1.6, OUTLINE));
  };
  eye(124, phase !== 'wink');
  eye(132, true);
  if (phase === 'heart') {
    bone(122, 162, 108, 174, 2.8, dark);
    bone(108, 174, 120, 184, 2.4, dark);
    bone(134, 162, 148, 174, 2.8, COLOR);
    bone(148, 174, 136, 184, 2.4, COLOR);
    parts.push(`<path d="M128 176 C122 168 112 170 116 178 C120 184 128 188 128 188 C128 188 136 184 140 178 C144 170 134 168 128 176" fill="none" stroke="${OUTLINE}" stroke-width="1.6"/>`);
    mark(112, 168, 2); mark(144, 170, 2); mark(128, 188, 2);
  } else if (phase === 'wink') {
    bone(122, 162, 114, 150, 2.8, dark);
    bone(114, 150, 124, 136, 2.4, dark);
    bone(134, 162, 146, 178, 2.8, COLOR);
    bone(146, 178, 140, 196, 2.4, COLOR);
  } else {
    bone(122, 162, 112, 180, 2.8, dark);
    bone(112, 180, 120, 196, 2.4, dark);
    bone(134, 162, 144, 180, 2.8, COLOR);
    bone(144, 180, 136, 196, 2.4, COLOR);
  }
  const placed = marks.map(m => ({ x: 128 + (m.x - 128) * 2, y: 244 + (m.y - 244) * 2, r: m.r * 2 }));
  return { svg: `<g transform="translate(128,244) scale(2) translate(-128,-244)">${parts.join('')}</g>`, marks: placed };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? (pose.front ? frontAnon(pose.front) : figure(pose)) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = pose.front ? m : cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
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
  [SPRINT_W, SPRINT_H, SPRINT_R],
  [STRUM_W, STRUM_H, STRUM_R],
  [{ ...FACE, front: 'wink' }, { ...FACE, front: 'heart' }, { ...FACE, front: 'back' }],
  [SPIN_W, SPIN_H, SPIN_R],
];

function propSheet(inner: string, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#00FF00"/>${inner}</svg>\n`;
}

/** Grip at the image center. Neck runs right, body at the outer end. Left half stays empty. */
function guitarSvg(): string {
  const neck = `<rect x="256" y="118" width="148" height="16" fill="#6b4530" stroke="#151222" stroke-width="2"/>`;
  const frets = [290, 320, 350, 380].map(x => stroke(x, 118, x, 134, 1.5, '#151222')).join('');
  const head = `<polygon points="246,104 292,98 304,128 292,158 246,152" fill="#6b4530" stroke="#151222" stroke-width="2"/>`;
  const body = `<polygon points="400,116 432,78 458,108 492,112 508,128 492,144 458,148 432,178 400,140" fill="#e48aa8" stroke="#151222" stroke-width="3"/>`;
  const guard = `<polygon points="430,120 476,112 498,128 476,146 430,138" fill="#f6d5e0" stroke="#151222" stroke-width="1.5"/>`;
  const pickup = `<rect x="448" y="120" width="14" height="16" rx="2" fill="#151222"/><rect x="470" y="121" width="12" height="14" rx="2" fill="#151222"/>`;
  return propSheet(head + neck + frets + body + guard + pickup, 512, 256);
}

function noteSvg(): string {
  const note = `<rect x="150" y="78" width="10" height="78" fill="#ff4f96" stroke="#151222" stroke-width="2"/>
    <ellipse cx="128" cy="156" rx="28" ry="16" transform="rotate(-24 128 156)" fill="#ff4f96" stroke="#151222" stroke-width="2"/>
    <path d="M160 78 C196 92 188 124 160 112" fill="#ff4f96" stroke="#151222" stroke-width="2"/>`;
  return propSheet(note, CELL, CELL);
}

function heartSvg(): string {
  const heart = `<path d="M128 168 C128 168 64 124 64 92 C64 68 86 54 108 66 C118 72 124 82 128 90 C132 82 138 72 148 66 C170 54 192 68 192 92 C192 124 128 168 128 168 Z" fill="#ff4f96" stroke="#151222" stroke-width="4"/>`;
  return propSheet(heart, CELL, CELL);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'anon');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const targets = [join(dir, 'common.png'), join(dir, 'special.png'), join(dir, 'note.png'), join(dir, 'heart.png'), join(dir, 'guitar.png')];
assertAllWritable(targets);
rasterSheet(targets[0], common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(targets[1], special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(targets[2], noteSvg(), CELL, CELL);
rasterSheet(targets[3], heartSvg(), CELL, CELL);
rasterSheet(targets[4], guitarSvg(), 512, 256);
console.log('wrote anon sheets');

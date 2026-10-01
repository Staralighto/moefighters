import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillType } from '../src/data/types.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, PHASES, SPECIAL_COLS, SPECIAL_KEYS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, headsTall, torsoPoints, torsoRadii, type Build, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block 市谷有咲: common 8×3, special 4×3 (U 认真模式 / I 才没有喜欢你呢 /
   O 脸靠的太近了 / L 无敌仓库大王), and the 256×256 box form picture. Standalone like
   taki-sheet.ts — write-sheets.ts stays frozen on the original three casts.
   The cast windup keeps the raised arms lower than the generic one: slim's full reach
   leaves the cell by ~2px and the cell check refuses it. */

type Limb = [number, number];
interface Pose { lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb; lying?: boolean; look?: number }

const IDLE: Pose = { lean: 0, crouch: 0, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
const BLOCK: Pose = { lean: -.05, crouch: 8, armF: [1.1, 1.5], armB: [.9, 1.7], legF: [.35, 0], legB: [-.2, 0] };
const HURT: Pose = { lean: -.3, crouch: 4, look: -.15, armF: [-.6, -.4], armB: [-.9, -.3], legF: [.4, 0], legB: [-.3, 0] };
const LYING: Pose = { ...HURT, crouch: 0, legF: [.1, 0], legB: [-.1, 0], lying: true };
const JUMP: Pose = { lean: .05, crouch: 0, armF: [2.4, -.4], armB: [-1.2, -.6], legF: [.9, -1.4], legB: [.3, -1.0] };
const PUNCH_WIND: Pose = { lean: -.08, crouch: 2, armF: [-.4, -1.9], armB: [.9, -1.6], legF: [.3, 0], legB: [-.3, 0] };
const PUNCH_HIT: Pose = { lean: .15, crouch: 2, look: .58, armF: [1.57, 0], armB: [.5, -1.8], legF: [.5, 0], legB: [-.4, 0] };
const KICK_WIND: Pose = { lean: -.1, crouch: 4, armF: [.5, -1.6], armB: [.8, -1.4], legF: [-.5, .8], legB: [0, 0] };
const KICK_HIT: Pose = { lean: -.25, crouch: 0, look: .5, armF: [-.3, -1.2], armB: [1.0, -1.2], legF: [1.5, .2], legB: [-.1, 0] };
const ENDURE_WIND: Pose = { lean: -.2, crouch: 6, armF: [-1.4, -.6], armB: [.8, -1.5], legF: [.5, 0], legB: [-.4, 0] };
const ENDURE_HIT: Pose = { lean: .3, crouch: 4, armF: [1.57, 0], armB: [-.5, -1.0], legF: [.7, 0], legB: [-.5, 0] };
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };

/* I 才没有喜欢你呢: hands fly to the cheeks on the windup, then the shy point forward. */
const TSUN_WIND: Pose = { lean: -.12, crouch: 2, look: -.1, armF: [-.9, -2.1], armB: [-.8, -2.0], legF: [.25, 0], legB: [-.25, 0] };
const TSUN_POINT: Pose = { lean: .22, crouch: 2, look: .55, armF: [1.5, -.1], armB: [-.7, -.9], legF: [.45, 0], legB: [-.35, 0] };

/* Contact, pass, opposite contact, opposite pass. The leg that reaches forward gets the opposite arm. */
const RUN: Pose[] = [
  { lean: .1, crouch: 8, look: .55, armF: [-.85, -1.15], armB: [.95, 1.15], legF: [.55, -.4], legB: [-.55, .45] },
  { lean: .06, crouch: 2, look: .55, armF: [.6, 1.05], armB: [-.55, -1.05], legF: [-.35, .15], legB: [.85, -1.35] },
  { lean: .1, crouch: 8, look: .55, armF: [.95, 1.15], armB: [-.85, -1.15], legF: [-.55, .45], legB: [.55, -.4] },
  { lean: .06, crouch: 2, look: .55, armF: [-.55, -1.05], armB: [.6, 1.05], legF: [.85, -1.35], legB: [-.35, .15] },
];

const LOCO_POSES: Record<string, Pose> = {
  idle: IDLE,
  run0: RUN[0], run1: RUN[1], run2: RUN[2], run3: RUN[3],
  jump: JUMP,
  block: BLOCK,
  dodge: DODGE,
  hurt: HURT,
  down: LYING,
  ko: LYING,
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return { lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k), armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB), legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying };
}

function pair(type: SkillType, air: boolean): [Pose, Pose, Pose] {
  const rest = air ? JUMP : IDLE;
  if (type === 'dash') return [DODGE, DODGE, mix(DODGE, IDLE, .55)];
  const [wind, hit] =
    type === 'light' ? (air ? [JUMP, PUNCH_HIT] as const : [PUNCH_WIND, PUNCH_HIT] as const) :
    type === 'heavy' ? (air ? [AIR_KICK_WIND, AIR_KICK_HIT] as const : [KICK_WIND, KICK_HIT] as const) :
    type === 'projectile' ? [TSUN_WIND, TSUN_POINT] as const :
    type === 'endure' ? [ENDURE_WIND, ENDURE_HIT] as const :
    [TSUN_WIND, TSUN_POINT] as const;
  return [wind, hit, mix(hit, rest, .55)];
}

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#AA66DD';
const BUILD: Build = 'slim';

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
  const d = DIMS[BUILD];
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
  const x = col * CELL, y = row * CELL;
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${BUILD} ${label} leaves the cell by ${over.toFixed(1)}px`);
    }
  }
  const text = label
    ? `<text x="4" y="13" fill="${GRID}" font-size="10" font-family="monospace">${label}</text>`
    : '';
  return `<g transform="translate(${x},${y})"><clipPath id="${clip}"><rect width="${CELL}" height="${CELL}"/></clipPath><g clip-path="url(#${clip})"><rect width="${CELL}" height="${CELL}" fill="${BG}"/>${drawn?.svg ?? ''}</g><rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`;
}

function poseForLabel(label: string): Pose | null {
  if (!label) return null;
  if (label in LOCO_POSES) return LOCO_POSES[label];
  const [name, phase] = label.split('-') as [string, (typeof PHASES)[number]];
  const air = name.startsWith('air');
  const type: SkillType = name.endsWith('Heavy') || name === 'heavy' ? 'heavy' : 'light';
  const i = PHASES.indexOf(phase);
  return pair(type, air)[i] ?? null;
}

function commonSheet(): string {
  const w = COMMON_COLS * CELL, h = COMMON_ROWS * CELL;
  const cells: string[] = [];
  for (let r = 0; r < COMMON_ROWS; r++) {
    for (let c = 0; c < COMMON_COLS; c++) {
      const label = COMMON_LABELS[r][c];
      cells.push(cell(label, poseForLabel(label), c, r));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}

function specialSheet(skills: SkillType[]): string {
  const w = SPECIAL_COLS * CELL, h = SPECIAL_ROWS * CELL;
  const cells: string[] = [];
  for (let r = 0; r < SPECIAL_ROWS; r++) {
    for (let c = 0; c < SPECIAL_COLS; c++) {
      const label = `${SPECIAL_KEYS[c]}-${PHASES[r]}`;
      cells.push(cell(label, pair(skills[c], false)[r], c, r));
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}

/* 无敌仓库大王: the one-picture box form (view.box). Transparent base per the SOP prop rule —
   placeholder props ship transparent; finished art arrives green-keyed and gets cut at load. */
function boxSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">`
    + `<rect x="44" y="88" width="168" height="132" rx="6" fill="#c8965a" stroke="#151222" stroke-width="5"/>`
    + `<rect x="44" y="88" width="168" height="26" fill="#a87a44" stroke="#151222" stroke-width="5"/>`
    + `<rect x="112" y="88" width="32" height="132" fill="#e8d9b0" stroke="#151222" stroke-width="4"/>`
    + `<rect x="36" y="70" width="60" height="24" rx="4" fill="#b78549" stroke="#151222" stroke-width="5"/>`
    + `<rect x="160" y="70" width="60" height="24" rx="4" fill="#b78549" stroke="#151222" stroke-width="5"/>`
    + `<circle cx="98" cy="168" r="7" fill="#151222"/><circle cx="158" cy="168" r="7" fill="#151222"/>`
    + `<path d="M112 196 q16 12 32 0" stroke="#151222" stroke-width="5" fill="none" stroke-linecap="round"/>`
    + `</svg>`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'arisa');
const commonPx: [number, number] = [COMMON_COLS * CELL, COMMON_ROWS * CELL];
const specialPx: [number, number] = [SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL];
const jobs = [
  { png: join(dir, 'common.png'), svg: commonSheet(), w: commonPx[0], h: commonPx[1] },
  { png: join(dir, 'special.png'), svg: specialSheet(['endure', 'projectile', 'endure', 'endure']), w: specialPx[0], h: specialPx[1] },
  { png: join(dir, 'box.png'), svg: boxSvg(), w: CELL, h: CELL },
];
for (const [name, d] of Object.entries(DIMS)) console.log(`${name} ${headsTall(d).toFixed(2)} heads`);
assertAllWritable(jobs.map(job => job.png));
for (const job of jobs) rasterSheet(job.png, job.svg, job.w, job.h);
console.log(`wrote ${jobs.length} arisa pngs`);

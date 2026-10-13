import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block CHU². Do not import write-sheets.ts.
   Special columns are U 牛肉干 (draw / throw / drop),
   I 垃圾桶 (lift / tip the can / crouch to pick up),
   O 草莓蛋糕 (hold / throw / drop),
   L 改变世界 (reach / hands on the deck / still at the deck).
   Common stays empty-handed. Jerky, trash, cake and notes fly as extras. */

type Limb = [number, number];
type Gear = 'can' | 'canTip' | 'canDown' | 'cake' | 'cakeOut' | 'deck';
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
  ox?: number;
  gear?: Gear;
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
const AIR_PUNCH_WIND: Pose = { ...JUMP, armF: [-.4, -1.9], armB: [.6, -1.2] };
const AIR_PUNCH_HIT: Pose = { ...JUMP, look: .55, armF: [1.57, 0], armB: [.4, -1.4] };
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };

const THROW_W: Pose = { ...PUNCH_WIND };
const THROW_H: Pose = { ...PUNCH_HIT };
const THROW_R: Pose = { ...IDLE, look: .2 };
const CAN_W: Pose = { ...KICK_WIND, gear: 'can' };
const CAN_H: Pose = { ...KICK_HIT, gear: 'canTip' };
const CAN_R: Pose = { lean: .35, crouch: 22, look: .45, armF: [.85, .35], armB: [.55, .7], legF: [.7, -.15], legB: [-.35, .1], gear: 'canDown' };
const CAKE_W: Pose = { lean: .02, crouch: 1, look: .25, armF: [1.05, .35], armB: [.85, .55], legF: [.28, 0], legB: [-.25, 0], gear: 'cake' };
const CAKE_H: Pose = { lean: .12, crouch: 0, look: .5, armF: [1.45, .05], armB: [.4, -1.4], legF: [.45, 0], legB: [-.35, 0], gear: 'cakeOut' };
const CAKE_R: Pose = { ...IDLE, look: .15 };
const DECK_W: Pose = { lean: .06, crouch: 1, look: .35, armF: [.95, -.15], armB: [.75, .1], legF: [.28, 0], legB: [-.25, 0], gear: 'deck' };
const DECK_H: Pose = { lean: .04, crouch: 2, look: .4, armF: [1.15, .2], armB: [1.0, .35], legF: [.3, 0], legB: [-.22, 0], gear: 'deck' };
const DECK_R: Pose = { lean: .02, crouch: 1, look: .3, armF: [1.05, .25], armB: [.9, .4], legF: [.26, 0], legB: [-.24, 0], gear: 'deck' };

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
const COLOR = '#00BBFF';

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

function box(marks: Mark[], x: number, y: number, w: number, h: number): void {
  marks.push({ x, y, r: 2 }, { x: x + w, y, r: 2 }, { x, y: y + h, r: 2 }, { x: x + w, y: y + h, r: 2 });
}

function gear(pose: Pose, parts: string[], marks: Mark[]): void {
  if (pose.gear === 'can') {
    box(marks, 42, -38, 16, 30);
    parts.push(`<rect x="42" y="-38" width="16" height="30" rx="2" fill="#6e767e" stroke="${OUTLINE}" stroke-width="3"/>`);
  } else if (pose.gear === 'canTip') {
    box(marks, 28, -28, 36, 16);
    parts.push(`<rect x="28" y="-28" width="36" height="16" rx="2" transform="rotate(-28 46 -20)" fill="#6e767e" stroke="${OUTLINE}" stroke-width="3"/>`);
  } else if (pose.gear === 'canDown') {
    box(marks, 22, -14, 40, 12);
    parts.push(`<rect x="22" y="-14" width="40" height="12" rx="2" fill="#6e767e" stroke="${OUTLINE}" stroke-width="3"/>`);
  } else if (pose.gear === 'cake' || pose.gear === 'cakeOut') {
    const x = pose.gear === 'cake' ? 30 : 52;
    const y = pose.gear === 'cake' ? -108 : -92;
    marks.push({ x, y, r: 16 });
    parts.push(`<ellipse cx="${x}" cy="${y}" rx="16" ry="10" fill="#fff6ee" stroke="${OUTLINE}" stroke-width="3"/>`);
    parts.push(`<circle cx="${x - 6}" cy="${y - 2}" r="3" fill="#e23b4a"/>`);
    parts.push(`<circle cx="${x + 5}" cy="${y + 1}" r="3" fill="#e23b4a"/>`);
  } else if (pose.gear === 'deck') {
    box(marks, 16, -124, 52, 18);
    parts.push(`<rect x="16" y="-124" width="52" height="18" rx="3" fill="#12343f" stroke="${OUTLINE}" stroke-width="3"/>`);
    parts.push(`<circle cx="32" cy="-115" r="6" fill="#00BBFF"/>`);
    parts.push(`<circle cx="52" cy="-115" r="6" fill="#1a1a1a" stroke="#00BBFF" stroke-width="2"/>`);
  }
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
  gear(pose, parts, marks);
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
  const wind = heavy ? (air ? AIR_KICK_WIND : KICK_WIND) : (air ? AIR_PUNCH_WIND : PUNCH_WIND);
  const hit = heavy ? (air ? AIR_KICK_HIT : KICK_HIT) : (air ? AIR_PUNCH_HIT : PUNCH_HIT);
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

const SPECIAL: Pose[][] = [
  [THROW_W, THROW_H, THROW_R],
  [CAN_W, CAN_H, CAN_R],
  [CAKE_W, CAKE_H, CAKE_R],
  [DECK_W, DECK_H, DECK_R],
];

function propSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${body}</svg>\n`;
}

const jerky = propSvg(`
  <rect x="68" y="116" width="124" height="24" rx="10" transform="rotate(-16 128 128)" fill="#8a4b28" stroke="#151222" stroke-width="4"/>
`);
const cake = propSvg(`
  <ellipse cx="128" cy="156" rx="72" ry="20" fill="#f4efe6" stroke="#151222" stroke-width="4"/>
  <rect x="56" y="104" width="144" height="54" fill="#fff6ee" stroke="#151222" stroke-width="4"/>
  <ellipse cx="128" cy="104" rx="72" ry="22" fill="#fffaf6" stroke="#151222" stroke-width="4"/>
  <circle cx="96" cy="100" r="9" fill="#e23b4a"/>
  <circle cx="128" cy="92" r="9" fill="#e23b4a"/>
  <circle cx="160" cy="100" r="9" fill="#e23b4a"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'chuchu');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const targets = ['common.png', 'special.png', 'jerky.png', 'cake.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(targets[0], common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(targets[1], special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'jerky.png'), jerky, CELL, CELL);
rasterSheet(join(dir, 'cake.png'), cake, CELL, CELL);
console.log('rasterized chuchu', dir);

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Layer only. Do not import write-sheets.ts.
   Common sheet is the shared empty-hand poses on the tall build.
   Special columns: U 入侵秀, I 燃尽 (load back, then slam down, empty hands), O 全力碰撞, L 大闹一场 windup / whiff / stumble.
   riot.png is the seven-hit route plus the crash. Empty hands, no bass. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; ox?: number;
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
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };

const RUSH_W: Pose = { lean: -.2, crouch: 10, ox: -8, armF: [-.7, -.5], armB: [-.4, -.3], legF: [-.15, .1], legB: [.55, -.2] };
const RUSH_H: Pose = { lean: .55, crouch: 8, look: .55, ox: 10, armF: [.9, .4], armB: [-1.1, -.4], legF: [1.15, -.25], legB: [-.95, .5] };
const RUSH_R: Pose = { lean: .2, crouch: 4, ox: 6, armF: [.7, .5], armB: [.2, .8], legF: [.55, 0], legB: [-.2, 0] };

/* I 燃尽: lean all the way back with both arms loaded overhead, then hinge and drive them down. */
const SMASH_W: Pose = { lean: -.72, crouch: 4, look: -.4, ox: -10, armF: [3.25, .12], armB: [3.0, .18], legF: [.2, 0], legB: [-.6, .18] };
const SMASH_H: Pose = { lean: 1.0, crouch: 12, look: .6, ox: 10, armF: [.5, -.06], armB: [.35, -.08], legF: [.9, -.45], legB: [-.4, .12] };
const SMASH_R: Pose = { lean: .42, crouch: 8, look: .45, ox: 4, armF: [.95, .12], armB: [.75, .08], legF: [.55, -.1], legB: [-.3, .05] };

const GRAB_W: Pose = { lean: .15, crouch: 4, armF: [1.2, -.2], armB: [1.05, 0], legF: [.45, 0], legB: [-.25, 0] };
const GRAB_H: Pose = { lean: .35, crouch: 14, look: .4, armF: [1.15, .7], armB: [.95, .85], legF: [.55, -.1], legB: [-.3, .15] };
const GRAB_R: Pose = { lean: .1, crouch: 4, armF: [.6, .9], armB: [.4, 1.1], legF: [.3, 0], legB: [-.2, 0] };

const RIOT_W: Pose = { lean: -.15, crouch: 8, ox: -4, armF: [-.5, -1.6], armB: [.3, -1.2], legF: [.35, 0], legB: [-.4, .1] };
const RIOT_H: Pose = { lean: .2, crouch: 4, look: .55, armF: [1.57, 0], armB: [.4, -1.4], legF: [.55, 0], legB: [-.35, 0] };
const RIOT_R: Pose = { lean: .35, crouch: 12, ox: 8, armF: [1.3, .4], armB: [-.2, .6], legF: [.9, -.2], legB: [-.7, .45] };

/* 0–6 are the strikes, one silhouette each. 7–11 is the crash settling, still wide. */
const RIOT_LABELS = ['直拳', '肘击', '膝撞', '反手', '上勾', '头槌', '劈拳', '踩实', '扫腿', '扬拳', '挑衅', '收势'];
const RIOT: Pose[] = [
  { lean: .85, crouch: 8, look: .62, ox: -6, armF: [1.12, .02], armB: [-2.5, .4], legF: [1.15, -.75], legB: [-1.1, .45] },
  { lean: .6, crouch: 6, look: .58, ox: 22, armF: [2.0, -2.6], armB: [-1.55, -.3], legF: [1.0, -.55], legB: [-.9, .32] },
  { lean: -.3, crouch: 4, look: .5, ox: 26, armF: [-1.5, -.05], armB: [-1.8, .08], legF: [1.48, -2.3], legB: [-.35, .1] },
  { lean: -.78, crouch: 2, look: .62, ox: 14, armF: [1.9, .02], armB: [-1.85, -.02], legF: [.75, -.18], legB: [-1.05, .18] },
  { lean: -.45, crouch: 10, look: .15, ox: 10, armF: [2.55, .12], armB: [.15, 1.45], legF: [.7, -.2], legB: [-.85, .3] },
  { lean: 1.15, crouch: 6, look: .62, ox: 18, armF: [-1.5, -.05], armB: [-1.75, .05], legF: [1.3, -1.0], legB: [-.5, .08] },
  { lean: .7, crouch: 8, look: .5, ox: -12, armF: [.85, .12], armB: [1.05, .08], legF: [.55, -.1], legB: [-2.15, .18] },
  { lean: 1.2, crouch: 8, look: .4, ox: 12, armF: [-.7, -.08], armB: [-1.05, .04], legF: [.2, .06], legB: [-1.85, .18] },
  { lean: -.25, crouch: 8, look: .45, ox: -18, armF: [2.2, .15], armB: [-.9, -.25], legF: [1.4, .08], legB: [-.25, .05] },
  { lean: -.55, crouch: 2, look: .05, ox: 6, armF: [2.45, .1], armB: [-.7, -.3], legF: [.45, -.05], legB: [-.4, .12] },
  { lean: .25, crouch: 6, look: .62, ox: 4, armF: [1.2, -.1], armB: [2.2, -1.9], legF: [1.0, -.45], legB: [-.95, .38] },
  { lean: .32, crouch: 10, look: .5, ox: 2, armF: [-.1, -1.6], armB: [.3, 1.35], legF: [.9, -.65], legB: [-.75, .38] },
];

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying, ox: b.ox,
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
const COLOR = '#CC0000';

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
  const d = DIMS.tall;
  const s = SHEET_SCALE;
  const dark = shade(COLOR, .62);
  const light = shade(COLOR, 1.35);
  const legLen = (d.thigh + d.shin) * s;
  const hip = { x: 0, y: -legLen + pose.crouch * s };
  const torsoH = d.torsoH * s;
  const shoulder = { x: hip.x + Math.sin(pose.lean) * torsoH, y: hip.y - Math.cos(pose.lean) * torsoH };
  const bend = pose.lying ? 0 : pose.crouch * .03;
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
      const left = pt.r - pt.x, right = pt.x + pt.r - CELL, top = pt.r - pt.y, bot = pt.y + pt.r - CELL;
      const over = Math.max(left, right, top, bot);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)} (L${left.toFixed(0)} R${right.toFixed(0)} T${top.toFixed(0)} B${bot.toFixed(0)})`);
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
  [RUSH_W, RUSH_H, RUSH_R],
  [SMASH_W, SMASH_H, SMASH_R],
  [GRAB_W, GRAB_H, GRAB_R],
  [RIOT_W, RIOT_H, RIOT_R],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'layer');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const riot = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => RIOT[r * 4 + c], (c, r) => RIOT_LABELS[r * 4 + c]);

const targets = ['common.png', 'special.png', 'riot.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'riot.png'), riot, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote layer sheets');

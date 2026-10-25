import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 伊泽枣 (natsume). Do not import write-sheets.ts.
   Special columns: U 专业工种 (run-up / dash through / skid and turn), I 状态不好，这次不算！
   (arms folding / arms crossed, head turned away / settle), O 天台是我的 (crouch to leap / air
   stomp / landing crouch), L 狼王来了 (kneel, hands at the collar / head thrown back howling /
   rising hunched into the wolf stance).
   Common is the shared empty-hand human sheet. wolf.png is the king sheet: same 8×3 grid and order
   as common, every cell a wolf-form pose (docs/natsume-skill-plan.md §5). Colour blocks only: ears,
   tail and claws belong to the img2img prompt, not the stick figure. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean;
  /** Horizontal shift of the whole figure, so a cycle can travel inside the cell. */
  ox?: number;
  /** Vertical shift (negative lifts the figure off the foot line) for the cells that are in the air. */
  oy?: number;
  /** Head angle. Defaults to the spine, so a crawl can keep the chest low and the face up. */
  neck?: number;
  /** Kept for the shared figure(); unused here. */
  stick?: boolean;
}

/** Leg limb from absolute thigh / shin angles, undoing the knee bend figure() adds from `crouch`. */
const legAbs = (thigh: number, shin: number, crouch: number): Limb => [thigh - crouch * .03, shin - thigh + crouch * .06];

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
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}


const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#D94444';
const WOLF_COLOR = '#8E2E3A';

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

function figure(pose: Pose, base: string): { svg: string; marks: Mark[] } {
  const d = DIMS.slim;
  const s = SHEET_SCALE;
  const dark = shade(base, .6);
  const light = shade(base, 1.35);
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
  // A drumstick continues out of the hand along the forearm direction.
  const stickIn = (from: Pt, [a1, a2]: Limb) => {
    const u = d.upperArm * s, f = d.foreArm * s;
    const hx = from.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = from.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const len = f * 1.5;
    const tx = hx + Math.sin(a1 + a2) * len, ty = hy + Math.cos(a1 + a2) * len;
    parts.push(stroke(hx, hy, tx, ty, 4, OUTLINE));
    marks.push({ x: tx, y: ty, r: 3 });
  };
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  if (pose.stick) stickIn(shoulder, pose.armB);
  const radii = torsoRadii(d.torsoW).map(n => n * s) as [number, number, number];
  const shell = torsoPoints(hip, shoulder, radii, 2);
  parts.push(poly(shell, OUTLINE));
  parts.push(poly(torsoPoints(hip, shoulder, radii, 0), base));
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
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, base);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, base);
  if (pose.stick) stickIn(shoulder, pose.armF);
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT + (pose.oy ?? 0)})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + (pose.oy ?? 0) + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number, base: string): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose, base) : null;
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

function sheet(cols: number, rows: number, poseAt: (c: number, r: number) => Pose | null, labelAt: (c: number, r: number) => string, base = COLOR): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(cell(labelAt(c, r), poseAt(c, r), c, r, base));
  }
  const w = cols * CELL, h = rows * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}


/* ---- U 专业工种: run-up crouch, the dash through the body, the skid where she turns round ---- */
const SAND_W: Pose = { lean: .38, crouch: 12, look: .45, armF: [-.9, -.9], armB: [.9, 1.0], legF: [.75, -.5], legB: [-.75, .4], ox: -4 };
const SAND_H: Pose = { lean: .6, crouch: 8, look: .6, armF: [1.5, 0], armB: [-1.0, -.7], legF: [1.2, -.2], legB: [-1.1, .5], ox: 6 };
const SAND_R: Pose = { lean: -.22, crouch: 10, look: -.1, neck: -.5, armF: [.35, .8], armB: [-.5, .25], legF: [.95, -.3], legB: legAbs(-.7, -.3, 10), ox: 6 };
/* ---- I 状态不好，这次不算！: arms fold, then crossed over the chest with the head turned away ---- */
const EXC_W: Pose = { lean: -.05, crouch: 2, look: .1, armF: [.6, -1.3], armB: [.4, -1.1], legF: [.3, 0], legB: [-.3, 0] };
const EXC_H: Pose = { lean: -.12, crouch: 0, look: -.22, neck: -.35, armF: [.7, -2.5], armB: [.55, -2.3], legF: [.35, 0], legB: [-.3, 0] };
const EXC_R: Pose = { lean: -.08, crouch: 0, look: -.2, neck: -.25, armF: [.65, -2.3], armB: [.5, -2.1], legF: [.3, 0], legB: [-.28, 0] };
/* ---- O 天台是我的: deep crouch before the leap, the stomp from above, the landing crouch ---- */
const ROOF_W: Pose = { lean: .3, crouch: 26, look: .3, armF: [-1.0, -.3], armB: [-.8, -.2], legF: [1.1, -1.6], legB: [.5, -1.2] };
const ROOF_H: Pose = { lean: .22, crouch: 0, look: .5, oy: -34, armF: [2.6, -.5], armB: [-1.6, -.4], legF: [.4, .1], legB: [1.1, -1.9] };
const ROOF_R: Pose = { lean: .35, crouch: 22, look: .35, armF: [.9, .3], armB: [.6, .4], legF: [1.0, -1.5], legB: [.3, -1.0] };
/* ---- L 狼王来了: kneel with both hands at the collar, head thrown back to howl, rising hunched ---- */
const HOWL_W: Pose = { lean: .35, crouch: 42, look: .15, neck: .6, armF: [.8, -3.0], armB: [.5, -2.9], legF: [1.3, -1.0], legB: [0, -1.5] };
const HOWL_H: Pose = { lean: -.18, crouch: 42, look: -.15, neck: -1.1, armF: [.8, -3.0], armB: [.5, -2.9], legF: [1.3, -1.0], legB: [0, -1.5] };
const HOWL_R: Pose = { lean: .5, crouch: 18, look: .5, neck: .95, armF: [.5, .35], armB: [.35, .4], legF: [.9, -.7], legB: [-.55, .35] };

const SPECIAL: Pose[][] = [
  [SAND_W, SAND_H, SAND_R],
  [EXC_W, EXC_H, EXC_R],
  [ROOF_W, ROOF_H, ROOF_R],
  [HOWL_W, HOWL_H, HOWL_R],
];

/* ---- wolf.png: the king sheet, cell for cell the common order ----
   Hunched stand (Yagami-style stance: shoulders sunk, claws hanging in front, leaning in), short
   low prowl, curled pounce, crossed claws over the head, low side slip; claw swings; crouch and
   ground pounce; KO; air claw and air dive. */
const W_IDLE: Pose = { lean: .5, crouch: 14, look: .55, neck: .95, armF: [.55, .25], armB: [.4, .35], legF: [.55, -.45], legB: [-.4, .1] };
const wRun = (armF: Limb, armB: Limb, legF: Limb, legB: Limb): Pose => ({ lean: .5, crouch: 16, look: .55, neck: .95, armF, armB, legF, legB });
const W_JUMP: Pose = { lean: .65, crouch: 0, oy: -14, look: .55, neck: 1.0, armF: [1.3, .2], armB: [1.0, .3], legF: [1.1, -1.8], legB: [.6, -1.6] };
const W_BLOCK: Pose = { lean: .35, crouch: 14, look: .4, neck: .8, armF: [2.7, -.9], armB: [2.9, -.8], legF: [.5, -.4], legB: [-.4, .1] };
const W_DODGE: Pose = { lean: -.4, crouch: 20, look: -.1, armF: [.2, .5], armB: [-.3, .6], legF: [1.0, -.9], legB: [-.9, .6], ox: -6 };
const W_HURT: Pose = { lean: -.45, crouch: 6, look: -.2, neck: -.5, armF: [-.7, -.5], armB: [-1.0, -.4], legF: [.45, 0], legB: [-.35, 0] };
const W_DOWN: Pose = { ...W_HURT, crouch: 0, legF: [.1, 0], legB: [-.1, 0], lying: true };
const W_L_WIND: Pose = { lean: .35, crouch: 14, look: .4, neck: .8, armF: [-1.0, -1.3], armB: [.5, .6], legF: [.6, -.5], legB: [-.5, .2] };
const W_L_HIT: Pose = { lean: .55, crouch: 14, look: .6, neck: 1.0, armF: [2.1, -.3], armB: [.6, .4], legF: [.9, -.6], legB: [-.7, .3] };
const W_L_REC: Pose = { lean: .5, crouch: 14, look: .55, neck: .95, armF: [.9, .2], armB: [.5, .35], legF: [.6, -.5], legB: [-.4, .1] };
const W_K_WIND: Pose = { lean: .5, crouch: 34, look: .55, neck: .95, armF: [-.8, -.8], armB: [-.6, -.9], legF: [1.2, -1.5], legB: [-.3, -.9] };
const W_K_HIT: Pose = { lean: 1.15, crouch: 10, oy: -18, look: .7, neck: 1.25, armF: [1.55, 0], armB: [1.45, .05], legF: [-.9, .2], legB: [-1.15, .3] };
const W_K_REC: Pose = { lean: .6, crouch: 22, look: .5, neck: .95, armF: [.5, .4], armB: [.35, .5], legF: legAbs(1.2, .1, 22), legB: legAbs(-.9, -.2, 22) };
const W_AL_WIND: Pose = { ...W_JUMP, armF: [-.9, -1.2] };
const W_AL_HIT: Pose = { ...W_JUMP, lean: .55, armF: [2.1, -.3], armB: [.7, .3] };
const W_AL_REC: Pose = { ...W_JUMP, armF: [1.0, .3] };
const W_AH_WIND: Pose = { ...W_JUMP, lean: .9, armF: [-1.0, -1.0], armB: [-.8, -1.0], legF: [1.4, -2.0], legB: [1.0, -2.0] };
const W_AH_HIT: Pose = { lean: .95, crouch: 0, oy: -16, look: .7, neck: 1.2, armF: [1.7, .1], armB: [1.5, .2], legF: [.6, .1], legB: [.9, -.2] };
const W_AH_REC: Pose = { ...W_JUMP, lean: .7 };

const WOLF: Record<string, Pose> = {
  idle: W_IDLE,
  run0: wRun([.7, .2], [.3, .4], [.65, -.5], [-.5, .2]),
  run1: wRun([.35, .35], [.65, .2], [.2, -.1], [.15, -.2]),
  run2: wRun([.3, .4], [.7, .2], [-.5, .2], [.65, -.5]),
  run3: wRun([.65, .2], [.35, .35], [.15, -.2], [.2, -.1]),
  jump: W_JUMP, block: W_BLOCK, dodge: W_DODGE, hurt: W_HURT, down: W_DOWN, ko: { ...W_DOWN, armF: [-.9, -.2], armB: [-1.2, -.1] },
  'light-windup': W_L_WIND, 'light-active': W_L_HIT, 'light-recover': W_L_REC,
  'heavy-windup': W_K_WIND, 'heavy-active': W_K_HIT, 'heavy-recover': W_K_REC,
  'airLight-windup': W_AL_WIND, 'airLight-active': W_AL_HIT, 'airLight-recover': W_AL_REC,
  'airHeavy-windup': W_AH_WIND, 'airHeavy-active': W_AH_HIT, 'airHeavy-recover': W_AH_REC,
};

function wolfPose(label: string): Pose | null {
  if (!label) return null;
  const p = WOLF[label];
  if (!p) throw new Error('wolf sheet has no pose for ' + label);
  return p;
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

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'natsume');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const wolf = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => wolfPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c], WOLF_COLOR);
const targets = ['common.png', 'special.png', 'wolf.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'wolf.png'), wolf, COMMON_COLS * CELL, COMMON_ROWS * CELL);
console.log('wrote natsume sheets');

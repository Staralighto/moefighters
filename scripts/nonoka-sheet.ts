import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Miyanaga Nonoka. Do not import write-sheets.ts — that script redraws the whole cast.
   Common is empty-handed. King is the same body with a head-tall staff in both hands: the shaft
   runs through the fists, not out of one, so a swing reads as a lever and not a pointer.
   Cape and crown stay out of the blocks; the prompt adds them. No hair. */

type Limb = [number, number];

/** The staff, placed from the front hand. Both arms are solved to it, so poses never list arm angles for it. */
interface Staff {
  /** Front-hand grip, px from the shoulder: +x forward, +y down. */
  gx: number; gy: number;
  /** Shaft angle in degrees CCW from screen-right; 90 puts the gem straight up. */
  ang: number;
  /** Back hand this far down the shaft from the front hand. Omit to let go (hurt, floor). */
  spread?: number;
  /** Shaft left below the front hand. Default is the low grip; a block chokes up. */
  butt?: number;
}

interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
  roar?: boolean;
  /** 食兔者: the iris goes white. */
  white?: boolean;
  staff?: Staff;
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

/* U 食兔者: wide beast crouch, then the bite. */
const BEAST: Pose = { lean: .16, crouch: 12, look: .5, armF: [1.15, .15], armB: [-1.25, .1], legF: [.72, -.15], legB: [-.78, .12], white: true };
const BITE: Pose = { lean: .48, crouch: 8, look: .6, armF: [1.35, .05], armB: [-.35, -.15], legF: [.6, 0], legB: [-.15, 0], white: true, roar: true };

/* I 抱抱还是亲亲: reach, kiss, let go. */
const HUG_W: Pose = { lean: .22, crouch: 4, look: .5, armF: [1.25, .35], armB: [.95, .55], legF: [.4, 0], legB: [-.15, 0] };
const KISS: Pose = { lean: .42, crouch: 2, look: .62, armF: [1.45, .15], armB: [1.15, .25], legF: [.35, 0], legB: [-.1, 0], roar: true };
const HUG_R: Pose = { lean: .08, crouch: 0, look: .4, armF: [.7, 1.2], armB: [.4, 1.4], legF: [.3, 0], legB: [-.25, 0] };

/* O 对半分: hands in, then spread, then back. */
const SPLIT_W: Pose = { lean: 0, crouch: 2, look: .45, armF: [.7, 1.3], armB: [.55, 1.45], legF: [.3, 0], legB: [-.3, 0] };
const SPLIT: Pose = { lean: -.04, crouch: 2, look: .5, armF: [1.7, .2], armB: [-1.55, .15], legF: [.35, 0], legB: [-.35, 0] };

/* Staff carries. Ceiling and front wall of a 256 cell: with the body on the foot line there are
   ~80px above the shoulder and ~120px ahead of it, so the gem end (136px) is either raised
   behind the shoulder or held at 45° in front. Every strike is therefore a downward chop. */
const GUARD: Staff = { gx: 18, gy: 20, ang: 46, spread: 26 };
/** Cocked over the rear shoulder like a bat. */
const COCK: Staff = { gx: 12, gy: 12, ang: 140, spread: 26 };
/** Gem laid all the way back at head height: the full heavy coil. */
const COIL: Staff = { gx: 14, gy: 4, ang: 155, spread: 26 };
/** Diagonal chop, hands close so the gem lands inside the cell. */
const CHOP: Staff = { gx: 13, gy: 0, ang: -45, spread: 26 };
/** Overhead smash driven into the ground ahead. */
const SMASH: Staff = { gx: 30, gy: 10, ang: -68, spread: 26 };
/** Coming back up toward the guard, hands low. */
const RETURN: Staff = { gx: 6, gy: 26, ang: 40, spread: 26 };

/* L 国王: glow with empty hands, raise the staff behind the shoulder, swing it out and down. */
const GLOW: Pose = { lean: -.08, crouch: 2, look: .55, armF: [2.2, .35], armB: [-1.15, -.25], legF: [.3, 0], legB: [-.3, 0] };
const STAFF_UP: Pose = { lean: -.04, crouch: 2, look: .5, armF: [0, 0], armB: [0, 0], legF: [.35, 0], legB: [-.3, 0], staff: { gx: 10, gy: 14, ang: 135, spread: 26 } };
const STAFF_OUT: Pose = { lean: .15, crouch: 2, look: .55, armF: [0, 0], armB: [0, 0], legF: [.5, 0], legB: [-.4, 0], staff: { gx: 20, gy: 2, ang: -50, spread: 26 } };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    look: b.look, roar: b.roar, white: b.white, staff: b.staff,
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
/** Official image colour. */
const COLOR = '#FFBBCC';
const STAFF = '#e23b4a';
const GEM = '#ff4d6a';

/** Head-tall shaft; the hands sit in its lower quarter so the gem end is the long lever. */
const STAFF_LEN = 180;
const BUTT = 44;
const GEM_R = 9;
const CAP_R = 5;

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

function disc(p: Pt, r: number, fill: string): string {
  return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"/>`;
}

/** Two-bone arm to a grip point. Elbow hangs below the shoulder→hand line. Throws when the grip is out of reach:
    a fist drawn short of the shaft is exactly the bug this file exists to avoid. */
function ik(from: Pt, to: Pt, l1: number, l2: number, what: string): Limb {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d > l1 + l2 + .5) throw new Error(`${what}: grip ${d.toFixed(1)}px from the shoulder, arm is ${(l1 + l2).toFixed(1)}`);
  const reach = Math.min(d, l1 + l2 - .01);
  const bend = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach))));
  const a1 = Math.atan2(dx, dy) - Math.sign(dx || 1) * bend;
  const mid = { x: from.x + Math.sin(a1) * l1, y: from.y + Math.cos(a1) * l1 };
  return [a1, Math.atan2(to.x - mid.x, to.y - mid.y) - a1];
}

function figure(pose: Pose, label = ''): { svg: string; marks: Mark[] } {
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
  const w = d.limb * s;
  const limb = (from: Pt, [a1, a2]: Limb, l1: number, l2: number, col: string) => {
    const mid = { x: from.x + Math.sin(a1) * l1, y: from.y + Math.cos(a1) * l1 };
    const end = { x: mid.x + Math.sin(a1 + a2) * l2, y: mid.y + Math.cos(a1 + a2) * l2 };
    parts.push(stroke(from.x, from.y, mid.x, mid.y, w + 4, OUTLINE));
    parts.push(stroke(mid.x, mid.y, end.x, end.y, w + 4, OUTLINE));
    parts.push(stroke(from.x, from.y, mid.x, mid.y, w, col));
    parts.push(stroke(mid.x, mid.y, end.x, end.y, w, col));
    const rad = (w + 4) / 2;
    marks.push({ x: from.x, y: from.y, r: rad }, { x: mid.x, y: mid.y, r: rad }, { x: end.x, y: end.y, r: rad });
    return end;
  };

  /* Staff geometry first: it decides both arms. */
  const st = pose.staff;
  let grip: Pt | null = null, rear: Pt | null = null, dir = { x: 1, y: 0 };
  let armF = pose.armF, armB = pose.armB;
  if (st) {
    const a = st.ang * Math.PI / 180;
    dir = { x: Math.cos(a), y: -Math.sin(a) };
    grip = { x: shoulder.x + st.gx, y: shoulder.y + st.gy };
    armF = ik(shoulder, grip, d.upperArm * s, d.foreArm * s, `${label} front hand`);
    if (st.spread) {
      rear = { x: grip.x - dir.x * st.spread, y: grip.y - dir.y * st.spread };
      armB = ik(shoulder, rear, d.upperArm * s, d.foreArm * s, `${label} back hand`);
    }
  }

  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  const handB = limb(shoulder, armB, d.upperArm * s, d.foreArm * s, dark);
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
  if (pose.white) {
    parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(er + 1.2).toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="#fff"/>`);
  } else {
    parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${(ex + er * .35).toFixed(1)}" cy="${(ey - er * .2).toFixed(1)}" r="${(er * .38).toFixed(1)}" fill="${light}"/>`);
  }
  if (pose.roar) parts.push(`<ellipse cx="${(cx + r * gaze * .8).toFixed(1)}" cy="${(cy + r * .55).toFixed(1)}" rx="${(r * .24).toFixed(1)}" ry="${(r * .36).toFixed(1)}" fill="${OUTLINE}"/>`);
  marks.push({ x: cx, y: cy, r: r + 2 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  const handF = limb(shoulder, armF, d.upperArm * s, d.foreArm * s, COLOR);

  if (st && grip) {
    const butt = st.butt ?? BUTT;
    const foot = { x: grip.x - dir.x * butt, y: grip.y - dir.y * butt };
    const tip = { x: grip.x + dir.x * (STAFF_LEN - butt), y: grip.y + dir.y * (STAFF_LEN - butt) };
    parts.push(stroke(foot.x, foot.y, tip.x, tip.y, 9, OUTLINE));
    parts.push(stroke(foot.x, foot.y, tip.x, tip.y, 5, STAFF));
    parts.push(disc(foot, CAP_R, OUTLINE), disc(foot, CAP_R - 1.5, shade(STAFF, .7)));
    parts.push(disc(tip, GEM_R, OUTLINE), disc(tip, GEM_R - 2.5, GEM));
    parts.push(disc({ x: tip.x - 2, y: tip.y - 2 }, 2, shade(GEM, 1.6)));
    /* Fists over the shaft: the hands wrap it, the shaft does not float in front of them. */
    const fist = (p: Pt, col: string) => parts.push(disc(p, w / 2 + 3, OUTLINE), disc(p, w / 2 + 1, col));
    if (rear) fist(handB, dark);
    fist(handF, COLOR);
    marks.push({ x: tip.x, y: tip.y, r: GEM_R }, { x: foot.x, y: foot.y, r: CAP_R });
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
  const drawn = pose ? figure(pose, label) : null;
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

/* King bodies for the attack cells. The common punch and kick are not swings: the strike gets a
   forward lean and a lunge instead of a kick leg, the coil sits back on the rear foot. */
const LUNGE: Pose = { lean: .3, crouch: 8, look: .5, armF: [0, 0], armB: [0, 0], legF: [.7, -.45], legB: [-.45, .1] };
const KING_BODY: Record<string, Pose> = {
  'light-windup': { ...PUNCH_WIND, look: .3 },
  'light-active': { ...PUNCH_HIT, lean: .18 },
  'light-recover': { ...IDLE, lean: .04, crouch: 2, look: .45 },
  'heavy-windup': { ...KICK_WIND, lean: -.14, crouch: 6, look: .3 },
  'heavy-active': LUNGE,
  'heavy-recover': { ...IDLE, lean: .1, crouch: 4, look: .45 },
  'airLight-active': { ...JUMP, lean: .12, look: .55 },
  'airHeavy-windup': { ...AIR_KICK_WIND, lean: -.12, look: .3 },
  'airHeavy-active': { ...JUMP, lean: .22, look: .5, legF: [.6, -.9], legB: [-.3, -.6] },
  'airHeavy-recover': { ...JUMP, lean: .08 },
};

/** Staff per king cell. Locomotion keeps the guard; the run bobs it; hurt and the floor go one-handed. */
const KING_STAFF: Record<string, Staff> = {
  idle: GUARD,
  run0: { ...GUARD, gx: 12, gy: 24, ang: 44 }, run1: { ...GUARD, gx: 14, gy: 22, ang: 48 }, run2: { ...GUARD, gx: 12, gy: 24, ang: 44 }, run3: { ...GUARD, gx: 14, gy: 22, ang: 48 },
  jump: { gx: 14, gy: 24, ang: 50, spread: 26 },
  /* Choked up and nearly upright across the front: the shaft, not the arms, takes the hit. */
  block: { gx: 26, gy: 12, ang: 85, spread: 30, butt: 84 },
  dodge: { gx: 10, gy: 14, ang: 130, spread: 26 },
  hurt: { gx: -4, gy: 14, ang: 135 },
  /* Lying: 90° in body space is level on the floor, gem past the head, one hand still on it. */
  down: { gx: 30, gy: 18, ang: 90 },
  ko: { gx: 30, gy: 18, ang: 90 },
  'light-windup': COCK, 'light-active': CHOP, 'light-recover': RETURN,
  'heavy-windup': COIL, 'heavy-active': SMASH, 'heavy-recover': RETURN,
  'airLight-windup': COCK, 'airLight-active': CHOP, 'airLight-recover': RETURN,
  'airHeavy-windup': COIL, 'airHeavy-active': SMASH, 'airHeavy-recover': RETURN,
};

function kingPose(label: string): Pose | null {
  const body = KING_BODY[label] ?? commonPose(label);
  if (!body) return null;
  const staff = KING_STAFF[label];
  if (!staff) throw new Error(`no staff for king cell ${label}`);
  return { ...body, staff };
}

const SPECIAL: Pose[][] = [
  [BEAST, BITE, mix(BITE, IDLE, .45)],
  [HUG_W, KISS, HUG_R],
  [SPLIT_W, SPLIT, mix(SPLIT, IDLE, .6)],
  [GLOW, STAFF_UP, STAFF_OUT],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'nonoka');

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const king = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => kingPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c] ? 'K-' + COMMON_LABELS[r][c] : '');
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);

const targets = ['common.png', 'king.png', 'special.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'king.png'), king, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote nonoka common/king/special sheets');

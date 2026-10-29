import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 祐天寺喵梦 (nyamu). Do not import write-sheets.ts.
   Special columns: U 左右开弓 (both sticks up at the shoulders / the front stick down on a head, the back
   one up / the front hand flung forward and empty, the back stick lowered), I 蹭热度 (the selfie stick up
   over her head / lunging, the front arm out round a shoulder, the stick high / upright, a peace sign at
   her cheek, the stick still up), O 喵姆喵姆 (both paws at her cheeks, head tilted / one paw raking
   forward, the other still at her cheek / the big swing through, low and forward), L 双踩地狱 — the one
   front-facing column: on a stool, both sticks up / both sticks down on the drums / slumped forward over
   the kit, arms hanging, no sticks. Only L faces the camera, so only L has two eyes.
   164 cm: the tall build. Common is the shared empty-hand human sheet. The kit is its own image
   (kit.png, finished art) and never enters a cell; the thrown stick, the phone window, hearts and claw
   marks all belong to fx (src/render/fx.ts). Colour blocks only: hair, clothes and shoes belong to the
   img2img prompt. `--svg <dir>` writes the two SVGs there instead (for a machine without Chrome). */

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
  /** Drumsticks in the front / back hand, carried on along the forearm. */
  stickF?: boolean;
  stickB?: boolean;
  /** A selfie stick in the back hand: a long pole on along the forearm with a phone at the tip. */
  selfie?: boolean;
  /** L column: seated, facing the camera. */
  front?: 'up' | 'hit' | 'slump';
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
const STICK = '#c4a574';
const POLE = '#8d8d96';
const PHONE = '#2a2433';
const COLOR = '#AA4477';

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
  const d = DIMS.tall;
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
  // A drumstick (or the selfie pole) continues out of the hand along the forearm direction.
  const stickIn = (from: Pt, [a1, a2]: Limb, len: number, col: string, phone = false) => {
    const u = d.upperArm * s, f = d.foreArm * s;
    const hx = from.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = from.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const tx = hx + Math.sin(a1 + a2) * len, ty = hy + Math.cos(a1 + a2) * len;
    parts.push(stroke(hx, hy, tx, ty, 5, OUTLINE));
    parts.push(stroke(hx, hy, tx, ty, 2.6, col));
    marks.push({ x: tx, y: ty, r: 3 });
    if (phone) {
      parts.push(`<rect x="${(tx - 7).toFixed(1)}" y="${(ty - 11).toFixed(1)}" width="14" height="22" rx="3" fill="${PHONE}" stroke="${OUTLINE}" stroke-width="2"/>`);
      marks.push({ x: tx, y: ty - 11, r: 8 }, { x: tx, y: ty + 11, r: 8 });
    }
  };
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  if (pose.stickB) stickIn(shoulder, pose.armB, d.foreArm * s * 1.5, STICK);
  if (pose.selfie) stickIn(shoulder, pose.armB, d.foreArm * s * 1.1, POLE, true);
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
  if (pose.stickF) stickIn(shoulder, pose.armF, d.foreArm * s * 1.5, STICK);
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT + (pose.oy ?? 0)})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

/** L column: seated on a stool facing the camera, drawn straight in cell space (foot line at CELL - FOOT).
 *  Same tall build and SHEET_SCALE as the side cells. Symmetric, so the facing flip still faces the camera.
 *  The kit is a separate image and never drawn here. */
function frontDrummer(beat: 'up' | 'hit' | 'slump', base: string): { svg: string; marks: Mark[] } {
  const d = DIMS.tall;
  const s = SHEET_SCALE;
  const dark = shade(base, .6);
  const light = shade(base, 1.35);
  const parts: string[] = [];
  const marks: Mark[] = [];
  const cx = CELL / 2, foot = CELL - FOOT;
  const w = d.limb * s;
  const bone = (x1: number, y1: number, x2: number, y2: number, width: number, c: string) => {
    parts.push(stroke(x1, y1, x2, y2, width + 4, OUTLINE));
    parts.push(stroke(x1, y1, x2, y2, width, c));
    marks.push({ x: x1, y: y1, r: (width + 4) / 2 }, { x: x2, y: y2, r: (width + 4) / 2 });
  };
  const slump = beat === 'slump';
  const hipY = foot - d.shin * s + 4;
  // Stool: seat under the hips, two legs to the floor.
  bone(cx - 22, hipY + 6, cx + 22, hipY + 6, 3, OUTLINE);
  bone(cx - 18, hipY + 6, cx - 20, foot, 2.4, OUTLINE);
  bone(cx + 18, hipY + 6, cx + 20, foot, 2.4, OUTLINE);
  // Thighs come at the camera (short), shins straight down to the floor, knees apart.
  for (const side of [-1, 1]) {
    const col = side < 0 ? dark : base;
    const knee = { x: cx + side * 30, y: hipY + 8 };
    bone(cx + side * 9, hipY, knee.x, knee.y, w + 1, col);
    bone(knee.x, knee.y, knee.x + side * 4, foot - 3, w, col);
  }
  // Torso. Slumped, it tips toward the camera: shorter, and the head drops in front of the chest.
  const torsoH = d.torsoH * s * (slump ? .78 : 1);
  const shY = hipY - torsoH;
  const half = d.torsoW * s * .5;
  parts.push(`<rect x="${(cx - half - 2).toFixed(1)}" y="${(shY - 2).toFixed(1)}" width="${(half * 2 + 4).toFixed(1)}" height="${(torsoH + 4).toFixed(1)}" rx="7" fill="${OUTLINE}"/>`);
  parts.push(`<rect x="${(cx - half).toFixed(1)}" y="${shY.toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${torsoH.toFixed(1)}" rx="6" fill="${base}"/>`);
  marks.push({ x: cx - half - 2, y: shY - 2, r: 0 }, { x: cx + half + 2, y: hipY + 2, r: 0 });
  const r = d.headR * s;
  const headY = slump ? shY + r * .35 : shY - r - NECK * s;
  parts.push(`<circle cx="${cx}" cy="${headY.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="${cx}" cy="${headY.toFixed(1)}" r="${r.toFixed(1)}" fill="${light}"/>`);
  marks.push({ x: cx, y: headY, r: r + 2 });
  if (slump) {
    // Eyes shut: two short lines.
    parts.push(stroke(cx - 7, headY + 1, cx - 2, headY + 2, 2, OUTLINE), stroke(cx + 2, headY + 2, cx + 7, headY + 1, 2, OUTLINE));
  } else {
    parts.push(`<circle cx="${cx - 5}" cy="${(headY - 1).toFixed(1)}" r="2.6" fill="${OUTLINE}"/><circle cx="${cx + 5}" cy="${(headY - 1).toFixed(1)}" r="2.6" fill="${OUTLINE}"/>`);
  }
  // Arms, mirrored. Elbow is relative to the shoulder and the hand to the elbow, x pointing outward;
  // each pair is one limb segment long (upper arm ≈ 28, forearm ≈ 25 at SHEET_SCALE).
  const arm = {
    up: { el: [18, -21], hand: [8, -24], stick: true },
    hit: { el: [20, 19], hand: [20, 16], stick: true },
    slump: { el: [9, 26], hand: [4, 25], stick: false },
  }[beat];
  const stickLen = d.foreArm * s * 1.3;
  for (const side of [-1, 1]) {
    const col = side < 0 ? dark : base;
    const sh = { x: cx + side * (half - 2), y: shY + 4 };
    const elbow = { x: sh.x + side * arm.el[0], y: sh.y + arm.el[1] };
    const hand = { x: elbow.x + side * arm.hand[0], y: elbow.y + arm.hand[1] };
    bone(sh.x, sh.y, elbow.x, elbow.y, w, col);
    bone(elbow.x, elbow.y, hand.x, hand.y, w - .5, col);
    if (arm.stick) {
      const dx = hand.x - elbow.x, dy = hand.y - elbow.y, len = Math.hypot(dx, dy) || 1;
      const tip = { x: hand.x + (dx / len) * stickLen, y: hand.y + (dy / len) * stickLen };
      parts.push(stroke(hand.x, hand.y, tip.x, tip.y, 5, OUTLINE));
      parts.push(stroke(hand.x, hand.y, tip.x, tip.y, 2.6, STICK));
      marks.push({ x: tip.x, y: tip.y, r: 3 });
    }
  }
  return { svg: parts.join(''), marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + (pose.oy ?? 0) + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number, base: string): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? (pose.front ? frontDrummer(pose.front, base) : figure(pose, base)) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = pose.front ? m : cellPoint(pose, m);
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


/* ---- U 左右开弓: both sticks up at the shoulders; the front stick down on a head, the back one up; the
   front hand flung forward and empty, the back stick lowered ---- */
const ROLL_W: Pose = { lean: .02, crouch: 6, look: .35, armF: [1.35, 1.55], armB: [1.05, 1.85], legF: [.35, -.1], legB: [-.3, .1], stickF: true, stickB: true };
const ROLL_H: Pose = { lean: .14, crouch: 8, look: .45, armF: [1.95, -.85], armB: [1.45, 1.5], legF: [.45, -.1], legB: [-.35, .15], stickF: true, stickB: true, ox: -10 };
const ROLL_R: Pose = { lean: .12, crouch: 4, look: .45, armF: [2.1, -.15], armB: [.5, .6], legF: [.5, -.1], legB: [-.4, .1], stickB: true, ox: -10 };
/* ---- I 蹭热度: the selfie stick up over her head; lunging, the front arm out round a shoulder, the stick
   high; upright, a peace sign at her cheek, the stick still up ---- */
const SELFIE_W: Pose = { lean: .05, crouch: 4, look: .3, armF: [.6, .4], armB: [2.3, .2], legF: [.35, 0], legB: [-.3, .1], selfie: true };
const SELFIE_H: Pose = { lean: .22, crouch: 10, look: .5, armF: [1.55, .15], armB: [2.35, .15], legF: [.75, -.25], legB: [-.65, .35], selfie: true, ox: -8 };
const SELFIE_R: Pose = { lean: -.02, crouch: 0, look: .25, neck: -.15, armF: [1.3, 1.75], armB: [2.25, .2], legF: [.25, 0], legB: [-.25, 0], selfie: true, ox: -6 };
/* ---- O 喵姆喵姆: both paws at her cheeks, head tilted; one paw raking forward, the other still at her
   cheek; the big swing through, low and forward ---- */
const PAW_W: Pose = { lean: .02, crouch: 6, look: .3, neck: -.25, armF: [.95, 2.05], armB: [.75, 2.25], legF: [.3, -.05], legB: [-.25, .05] };
const PAW_H: Pose = { lean: .15, crouch: 8, look: .5, armF: [1.9, -.4], armB: [.8, 2.2], legF: [.5, -.1], legB: [-.4, .15] };
const PAW_R: Pose = { lean: .35, crouch: 14, look: .55, neck: .2, armF: [1.05, -.1], armB: [1.4, .6], legF: [.8, -.4], legB: [-.7, .4], ox: -12 };
/* ---- L 双踩地狱: the one front-facing column ---- */
const FACE: Pose = { lean: 0, crouch: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] };

const SPECIAL: Pose[][] = [
  [ROLL_W, ROLL_H, ROLL_R],
  [SELFIE_W, SELFIE_H, SELFIE_R],
  [PAW_W, PAW_H, PAW_R],
  [{ ...FACE, front: 'up' }, { ...FACE, front: 'hit' }, { ...FACE, front: 'slump' }],
];

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

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'nyamu');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* kit.png is finished art and stays out of this list for good. Take a sheet out once its art lands (SOP 8). */
const SHEETS: [string, string, number, number][] = [
  ['common.png', common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
  ['special.png', special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote nyamu svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log('wrote nyamu sheets');
}

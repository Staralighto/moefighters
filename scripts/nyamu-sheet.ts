import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block Nyamu only. Do not import write-sheets.ts — that script redraws the whole cast.
   U spin kick, I low sweep, O crescent slam, L faces the camera on a stool. The kit is a separate image.
   ponytail: sit skips the crouch-bend so a stool pose can drop the hips. Ceiling = CELL. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; sit?: boolean;
  stool?: boolean; sticks?: 'up' | 'hit' | 'back';
  /** Shift the whole figure. Negative leaves room for a kick to the right. */
  ox?: number;
  /** Seated, facing the camera. The kit stays a separate image. */
  front?: 'up' | 'hit' | 'back';
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
/* High kick: torso folded left, leg up to the right. Body sits left so the leg can reach. */
const SPIN_W: Pose = {
  ox: -12, sit: true, lean: -.5, crouch: 2, look: .15,
  armF: [.15, -1.1], armB: [1.7, -.25], legF: [2.05, -1.2], legB: [.08, 0],
};
const SPIN_H: Pose = {
  ox: -22, sit: true, lean: -1.15, crouch: 0, look: .4,
  armF: [.4, .5], armB: [-.35, .4], legF: [2.35, .1], legB: [.06, .02],
};
const SPIN_R: Pose = {
  ox: -12, sit: true, lean: -.4, crouch: 2, look: .25,
  armF: [-.15, -.7], armB: [1.15, -.35], legF: [1.8, .4], legB: [.05, 0],
};
/* Ground sweep: hips on the floor, one hand planted, the other leg straight out. */
const SWEEP_W: Pose = {
  ox: -14, sit: true, lean: .4, crouch: 42, look: .35,
  armF: [.7, -.5], armB: [-.2, .35], legF: [.95, -.25], legB: [1.15, -1.4],
};
const SWEEP_H: Pose = {
  ox: -24, sit: true, lean: 1.35, crouch: 68, look: .5,
  armF: [1.1, -.3], armB: [-.45, .45], legF: [1.5, .06], legB: [1.28, -2.85],
};
const SWEEP_R: Pose = {
  ox: -10, sit: true, lean: .25, crouch: 16, look: .35,
  armF: [.35, -.8], armB: [.1, .25], legF: [.85, -.15], legB: [.12, 0],
};
/* Crescent: the torso turns across the three frames, then the leg comes down. */
const ARC_W: Pose = {
  ox: -14, sit: true, lean: -.75, crouch: 2, look: -.15,
  armF: [-.55, -.45], armB: [1.45, -.4], legF: [-2.05, 1.05], legB: [.1, 0],
};
const ARC_H: Pose = {
  ox: -20, sit: true, lean: .4, crouch: 0, look: .55,
  armF: [-.95, -.25], armB: [2.15, -.2], legF: [2.15, -.4], legB: [.08, 0],
};
const ARC_R: Pose = {
  ox: -16, sit: true, lean: .9, crouch: 6, look: .55,
  armF: [.2, -1.05], armB: [-.65, -.45], legF: [1.12, -.5], legB: [-.12, .12],
};

const FACE: Pose = { lean: 0, crouch: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0] };
const SIT_UP: Pose = { ...FACE, front: 'up' };
const SIT_HIT: Pose = { ...FACE, front: 'hit' };
const SIT_BACK: Pose = { ...FACE, front: 'back' };

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
const STICK = '#c4a574';
const SCALE = 0.58;
const FOOT = 12;
const COLOR = '#C6B4E3';

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
  const bend = pose.sit ? 0 : pose.crouch * .03;
  const parts: string[] = [];
  const marks: Mark[] = [];
  const limb = (from: Pt, [a1, a2]: Limb, l1: number, l2: number, col: string): Pt => {
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
  if (pose.stool) {
    const seatY = hip.y + 5;
    const x0 = hip.x - 16, x1 = hip.x + 14;
    parts.push(stroke(x0, seatY, x1, seatY, 4, OUTLINE));
    parts.push(stroke(x0 + 3, seatY, x0 + 3, 1, 3, OUTLINE));
    parts.push(stroke(x1 - 3, seatY, x1 - 3, 1, 3, OUTLINE));
    marks.push({ x: x0, y: seatY, r: 3 }, { x: x1, y: seatY, r: 3 }, { x: x0 + 3, y: 1, r: 3 }, { x: x1 - 3, y: 1, r: 3 });
  }
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  const handB = limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
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
  const handF = limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.sticks) {
    const reach = pose.sticks === 'hit' ? 18 : 15;
    const stick = (hand: Pt, [a1, a2]: Limb) => {
      const ang = a1 + a2;
      const tip = { x: hand.x + Math.sin(ang) * reach, y: hand.y + Math.cos(ang) * reach };
      parts.push(stroke(hand.x, hand.y, tip.x, tip.y, 3, OUTLINE));
      parts.push(stroke(hand.x, hand.y, tip.x, tip.y, 1.6, STICK));
      marks.push({ x: tip.x, y: tip.y, r: 2 });
    };
    stick(handB, pose.armB);
    stick(handF, pose.armF);
  }
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

/** Front view, symmetric, so a facing flip still looks like she is looking at the camera. No kit. */
function frontDrummer(beat: 'up' | 'hit' | 'back'): { svg: string; marks: Mark[] } {
  const dark = shade(COLOR, .6);
  const light = shade(COLOR, 1.35);
  const parts: string[] = [];
  const marks: Mark[] = [];
  const mark = (x: number, y: number, r: number) => marks.push({ x, y, r });
  const bone = (x1: number, y1: number, x2: number, y2: number, w: number, c: string) => {
    parts.push(stroke(x1, y1, x2, y2, w + 3, OUTLINE));
    parts.push(stroke(x1, y1, x2, y2, w, c));
    const rad = (w + 3) / 2;
    mark(x1, y1, rad);
    mark(x2, y2, rad);
  };
  bone(46, 98, 82, 98, 3, OUTLINE);
  bone(50, 98, 48, 118, 2.4, OUTLINE);
  bone(78, 98, 80, 118, 2.4, OUTLINE);
  bone(56, 96, 36, 106, 5.5, dark);
  bone(36, 106, 32, 118, 4.5, dark);
  bone(72, 96, 92, 106, 5.5, COLOR);
  bone(92, 106, 96, 118, 4.5, COLOR);
  parts.push(`<rect x="49" y="58" width="30" height="40" rx="7" fill="${OUTLINE}"/>`);
  parts.push(`<rect x="52" y="61" width="24" height="34" rx="6" fill="${COLOR}"/>`);
  mark(49, 58, 2); mark(79, 58, 2); mark(49, 98, 2); mark(79, 98, 2);
  parts.push(`<circle cx="64" cy="42" r="14" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="64" cy="42" r="12" fill="${light}"/>`);
  mark(64, 42, 14);
  parts.push(`<circle cx="59" cy="41" r="2.2" fill="${OUTLINE}"/><circle cx="69" cy="41" r="2.2" fill="${OUTLINE}"/>`);
  const beatArm = {
    up: { elbow: [34, 46], hand: [28, 28], tip: [24, 14] },
    hit: { elbow: [30, 72], hand: [20, 86], tip: [14, 98] },
    back: { elbow: [32, 56], hand: [24, 40], tip: [18, 26] },
  }[beat];
  const arm = (elbow: number[], hand: number[], tip: number[], c: string) => {
    bone(elbow[0] < 64 ? 50 : 78, 62, elbow[0], elbow[1], 4.5, c);
    bone(elbow[0], elbow[1], hand[0], hand[1], 4, c);
    bone(hand[0], hand[1], tip[0], tip[1], 1.6, STICK);
  };
  const [ex, ey] = beatArm.elbow, [hx, hy] = beatArm.hand, [tx, ty] = beatArm.tip;
  arm([ex, ey], [hx, hy], [tx, ty], dark);
  arm([128 - ex, ey], [128 - hx, hy], [128 - tx, ty], COLOR);
  return { svg: parts.join(''), marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? (pose.front ? frontDrummer(pose.front) : figure(pose)) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = pose.front ? m : cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px at ${p.x.toFixed(1)},${p.y.toFixed(1)} r${p.r.toFixed(1)}`);
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
  [SPIN_W, SPIN_H, SPIN_R],
  [SWEEP_W, SWEEP_H, SWEEP_R],
  [ARC_W, ARC_H, ARC_R],
  [SIT_UP, SIT_HIT, SIT_BACK],
];

/* Side-view block-out of the reference kit. Seat gap stays empty; she brings the stool. */
function kitSvg(): string {
  const stand = (x: number, y: number) => stroke(x, y, x, 236, 3, '#8d8d96');
  const cymbal = (x: number, y: number, rx: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="7" fill="#e0b84a" stroke="#151222" stroke-width="2"/>`;
  const drum = (x: number, y: number, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#16141c" stroke="#151222" stroke-width="3"/>` +
    `<circle cx="${x}" cy="${y}" r="${Math.max(4, r - 7)}" fill="none" stroke="#3a3844" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256" viewBox="0 0 512 256">
    <rect width="512" height="256" fill="#00FF00"/>
    ${stand(88, 78)}${cymbal(88, 74, 30)}${cymbal(88, 84, 28)}
    ${stand(210, 48)}${cymbal(210, 44, 38)}
    ${stand(390, 40)}${cymbal(390, 36, 44)}
    ${drum(228, 162, 30)}
    ${stroke(248, 168, 292, 130, 3, '#8d8d96')}${stroke(330, 168, 292, 124, 3, '#8d8d96')}
    ${drum(268, 112, 24)}${drum(318, 104, 22)}
    ${drum(300, 176, 54)}
    ${drum(424, 158, 36)}
  </svg>\n`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'nyamu');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const targets = [join(dir, 'common.png'), join(dir, 'special.png'), join(dir, 'kit.png')];
assertAllWritable(targets);
rasterSheet(targets[0], common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(targets[1], special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(targets[2], kitSvg(), 512, 256);
console.log('wrote nyamu sheets');

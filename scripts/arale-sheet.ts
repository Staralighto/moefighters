import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Nakamachi Arale. Do not import write-sheets.ts — that script redraws the whole cast.
   All three sheets are placeholders: common/special go through the img2img flow, frenzy mirrors
   Soyo's (row 0 jab flurry, row 1 kicks, row 2 the coiled stance). No hair or costume on the
   blocks; the megaphone is a prop of the I column only, like Taki's drumsticks. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
  /** Open mouth: the shout. */
  roar?: boolean;
  /** I column only: a megaphone cone continues out of the front hand along the forearm. */
  mega?: boolean;
  /** Sideways nudge in pixels for poses that would otherwise leave the cell. */
  ox?: number;
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

/* 狂化 J/K: jab-cross flurry, high kick into a round kick, then the coiled stance. */
const JAB: Pose = PUNCH_HIT;
const CROSS: Pose = { lean: .24, crouch: 2, look: .58, armF: [.55, -.8], armB: [1.5, .1], legF: [.55, 0], legB: [-.45, 0] };
const HIGH_KICK: Pose = { lean: -.32, crouch: 0, look: .5, armF: [-.5, -1.0], armB: [1.1, -.9], legF: [1.9, .1], legB: [-.12, 0] };
const ROUND_KICK: Pose = { lean: -.1, crouch: 0, look: .5, armF: [-.9, -.5], armB: [1.35, -.4], legF: [1.45, .55], legB: [-.15, 0] };
const STANCE: Pose = { lean: .06, crouch: 5, look: .45, armF: [.75, -1.5], armB: [.6, -1.7], legF: [.4, -.15], legB: [-.3, .1] };

/* U 高能量！: the flurry — chamber, straight punch, back to guard. */
const FLURRY_W: Pose = PUNCH_WIND;
const FLURRY_H: Pose = PUNCH_HIT;

/* I 高音量！: megaphone to the mouth, the thrust and shout, then lowered. */
const MEGA_W: Pose = { lean: -.06, crouch: 3, look: .5, armF: [.9, 1.7], armB: [-.5, -.4], legF: [.3, 0], legB: [-.3, 0], mega: true };
const MEGA_H: Pose = { lean: .12, crouch: 2, look: .6, armF: [1.45, .1], armB: [-1.0, -.5], legF: [.5, 0], legB: [-.4, 0], mega: true, roar: true };
const MEGA_R: Pose = { lean: .02, crouch: 1, look: .4, armF: [1.1, .9], armB: [-.4, -.3], legF: [.35, 0], legB: [-.3, 0], mega: true };

/* O 高肌肉！: arms rise into the double-biceps flex and hold it there. */
const FLEX_W: Pose = { lean: -.05, crouch: 3, look: .45, armF: [1.2, .8], armB: [1.0, .9], legF: [.3, 0], legB: [-.3, 0] };
const FLEX: Pose = { lean: -.12, crouch: 8, look: .5, armF: [1.65, 1.45], armB: [1.5, 1.6], legF: [.4, -.1], legB: [-.35, .1] };

/* L 梦想即力量！: both fists to the sky, then the coiled power stance. */
const DREAM_W: Pose = { lean: -.06, crouch: 2, look: .55, armF: [2.5, .5], armB: [-1.1, -.4], legF: [.3, 0], legB: [-.3, 0] };
const DREAM_H: Pose = { lean: -.04, crouch: 0, look: .6, armF: [2.95, .2], armB: [3.2, -.15], legF: [.3, 0], legB: [-.3, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    look: b.look, roar: b.roar, mega: b.mega, ox: b.ox,
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
/** Her official image colour: the bright image-key yellow. */
const COLOR = '#FFEE55';
const CONE = '#f6f2e8';

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
  if (pose.roar) parts.push(`<ellipse cx="${(cx + r * gaze * .8).toFixed(1)}" cy="${(cy + r * .55).toFixed(1)}" rx="${(r * .24).toFixed(1)}" ry="${(r * .36).toFixed(1)}" fill="${OUTLINE}"/>`);
  marks.push({ x: cx, y: cy, r: r + 2 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.mega) {
    // The cone continues out of the front hand along the forearm direction: tip at the palm, mouth ahead.
    const [a1, a2] = pose.armF;
    const u = d.upperArm * s, f = d.foreArm * s;
    const hx = shoulder.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = shoulder.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const th = a1 + a2;
    const dx = Math.sin(th), dy = Math.cos(th);
    const px = Math.cos(th), py = -Math.sin(th);
    const len = 26, r0 = 4, r1 = 13;
    const tip: Pt = { x: hx - px * r0, y: hy - py * r0 };
    const cone = [
      tip,
      { x: hx + dx * len + px * r1, y: hy + dy * len + py * r1 },
      { x: hx + dx * len - px * r1, y: hy + dy * len - py * r1 },
      tip,
    ];
    parts.push(poly(cone, CONE));
    parts.push(`<polygon points="${cone.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>`);
    parts.push(`<circle cx="${(hx + dx * len).toFixed(1)}" cy="${(hy + dy * len).toFixed(1)}" r="${r1.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="2.4"/>`);
    marks.push({ x: hx + dx * len, y: hy + dy * len, r: r1 });
  }
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
      const over = Math.max(-pt.x + pt.r, pt.x + pt.r - CELL, -pt.y + pt.r, pt.y + pt.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px`);
    }
    // Guard against the old 128-cell figure sneaking back: even a kneel fills nearly half the cell.
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

const SPECIAL: Pose[][] = [
  [FLURRY_W, FLURRY_H, mix(FLURRY_H, IDLE, .55)],
  [MEGA_W, MEGA_H, MEGA_R],
  [FLEX_W, FLEX, FLEX],
  [DREAM_W, DREAM_H, STANCE],
];

const FRENZY: Pose[][] = [
  [PUNCH_WIND, JAB, CROSS, STANCE],
  [KICK_WIND, HIGH_KICK, ROUND_KICK, STANCE],
  [STANCE, null, null, null],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'arale');

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const frenzy = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => FRENZY[r][c], (c, r) => ['jab', 'kick', 'stance'][r] + '-' + c);

const targets = ['common.png', 'special.png', 'frenzy.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'frenzy.png'), frenzy, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote arale common/special/frenzy sheets');

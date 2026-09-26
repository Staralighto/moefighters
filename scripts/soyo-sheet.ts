import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Dims, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Soyo only. Do not import write-sheets.ts — that script redraws the whole cast.
   ponytail: long-hair silhouette behind the head, a bass on column 3.
   All four special columns are side views now: img2img models keep failing on a camera column. */

type Limb = [number, number];
type Bass = 'set' | 'play' | 'hold';
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; bass?: Bass; front?: boolean;
  /** Front-face extras: closed lids, a firm brow, or a faint smile. */
  lids?: boolean; brow?: boolean; smile?: boolean; roar?: boolean; tear?: boolean;
  /** Sideways nudge in pixels for poses that would otherwise leave the cell. */
  ox?: number;
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

/* 欧内该: the desperate lunge, the kneel with a wrist in both hands, then rising out of it. */
const LUNGE: Pose = { lean: .42, crouch: 7, look: .58, armF: [1.25, .1], armB: [1.05, .25], legF: [1.0, -.25], legB: [-.85, .5] };
const KNEEL: Pose = { lean: .14, crouch: 46, look: .08, armF: [1.15, .3], armB: [.9, .5], legF: [1.25, -1.25], legB: [-.95, -.65], tear: true };
const RISE: Pose = { lean: .04, crouch: 16, look: .18, armF: [.55, 1.2], armB: [.35, 1.5], legF: [.45, -.35], legB: [-.35, -.1] };

/* 就由我来结束一切: raised and crossed overhead, slashed down in release, then idle. */
const CROSS_UP: Pose = { lean: -.04, crouch: 0, armF: [2.4, 1.2], armB: [3.0, -1.0], legF: [.12, 0], legB: [-.12, 0] };
const CROSS_DOWN: Pose = { lean: -.08, crouch: 0, armF: [1.35, .35], armB: [-1.5, .3], legF: [.35, 0], legB: [-.3, 0] };

/* 不甘的演奏: bass onto the strap, the crying strum, the shaky hold. */
const BASS_W: Pose = { lean: .02, crouch: 0, bass: 'set', armF: [.8, -1.1], armB: [.4, 1.1], legF: [.22, 0], legB: [-.18, 0], tear: true };
const BASS_H: Pose = { lean: .04, crouch: 0, bass: 'play', look: .12, armF: [.95, .55], armB: [.42, 1.2], legF: [.22, 0], legB: [-.18, 0], tear: true };
const BASS_R: Pose = { lean: 0, crouch: 0, bass: 'hold', look: .3, armF: [.7, -.7], armB: [.38, 1.15], legF: [.22, 0], legB: [-.18, 0] };

/* 为什么要演奏春日影: the gasp, the roar, the glare. */
const ROAR_W: Pose = { lean: -.06, crouch: 3, armF: [.6, -2.3], armB: [-.5, -2.2], legF: [.3, 0], legB: [-.3, 0] };
const ROAR_H: Pose = { lean: -.16, crouch: 0, look: .55, armF: [.8, -2.7], armB: [-.7, -2.6], legF: [.35, 0], legB: [-.3, 0], roar: true };
const ROAR_R: Pose = { lean: .06, crouch: 1, look: .5, armF: [.45, -1.4], armB: [.3, -1.2], legF: [.3, 0], legB: [-.28, 0] };

/* 狂化 J/K: jab-cross flurry, high kick into a round kick, then the coiled stance. */
const JAB: Pose = PUNCH_HIT;
const CROSS: Pose = { lean: .24, crouch: 2, look: .58, armF: [.55, -.8], armB: [1.5, .1], legF: [.55, 0], legB: [-.45, 0] };
const HIGH_KICK: Pose = { lean: -.32, crouch: 0, look: .5, armF: [-.5, -1.0], armB: [1.1, -.9], legF: [1.9, .1], legB: [-.12, 0] };
const ROUND_KICK: Pose = { lean: -.1, crouch: 0, look: .5, armF: [-.9, -.5], armB: [1.35, -.4], legF: [1.45, .55], legB: [-.15, 0] };
const STANCE: Pose = { lean: .06, crouch: 5, look: .45, armF: [.75, -1.5], armB: [.6, -1.7], legF: [.4, -.15], legB: [-.3, .1] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    front: b.front, lids: b.lids, brow: b.brow, smile: b.smile, roar: b.roar, tear: b.tear, look: b.look, bass: b.bass,
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
const FOOT = 12;
/** Cream yellow, the official image colour. */
const COLOR = '#FFDD88';
const HAIR = '#8a6a4e';
const TEAR = '#9fd8e8';
/* The bass: warm cream body, white guard, two soapbar pickups, four tuners. */
const BASS_BODY = '#f2e6c4';
const BASS_GUARD = '#f8f4ea';
const BASS_PICKUP = '#1a1a1e';
const BASS_NECK = '#c4a36a';

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

/* Neck points up. Longer than a guitar: full bass proportions shrunk as a whole. */
const xy = (x: number, y: number): Pt => ({ x, y });
const BASS_SHAPE: Pt[] = [
  xy(-3.4, -14), xy(-9, -9), xy(-15, -13), xy(-17, -5), xy(-14, 3), xy(-15.5, 12),
  xy(-8, 18), xy(1, 19.5), xy(10.5, 16), xy(15.5, 8), xy(16, 0), xy(13, -6.5), xy(8.5, -12), xy(4.4, -7.5), xy(3.4, -14),
];
const BASS_GUARD_SHAPE: Pt[] = [
  xy(-1, -9.5), xy(3.4, -11.5), xy(9.5, -6.5), xy(12, 2), xy(10.5, 13), xy(3, 16.5), xy(-5.5, 14), xy(-9.5, 5.5), xy(-6.5, -2),
];
const BASS_ENDS: Pt[] = [...BASS_SHAPE, xy(-5.5, -56), xy(4, -56), xy(3.2, -44), xy(-3.2, -44)];

function bassOf(shoulder: Pt, kind: Bass): { svg: string; marks: Mark[] } {
  const place = kind === 'set'
    ? { x: shoulder.x - 8, y: shoulder.y + 14, rot: -38, s: 1.1 }
    : kind === 'play'
      ? { x: shoulder.x + 6, y: shoulder.y + 30, rot: 20, s: 1.2 }
      : { x: shoulder.x + 3, y: shoulder.y + 29, rot: 12, s: 1.3 };
  const rad = place.rot * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const map = (p: Pt): Pt => ({
    x: place.x + (p.x * cos - p.y * sin) * place.s,
    y: place.y + (p.x * sin + p.y * cos) * place.s,
  });
  const marks = BASS_ENDS.map(p => ({ ...map(p), r: 2 }));
  const frets = [-20, -26, -32, -38].map(y => stroke(-2.1, y, 2.1, y, 0.7, '#b08d55'));
  const tuners = [-51, -53.4, -55.6, -40.2].map(y =>
    `<circle cx="-5.8" cy="${y}" r="1.3" fill="${BASS_PICKUP}"/>`).join('');
  const svg = `<g transform="translate(${place.x.toFixed(1)},${place.y.toFixed(1)}) rotate(${place.rot}) scale(${place.s})">${[
    poly(BASS_SHAPE, BASS_BODY),
    `<polygon points="${BASS_SHAPE.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>`,
    poly(BASS_GUARD_SHAPE, BASS_GUARD),
    `<rect x="-2.6" y="-6.4" width="6.4" height="3.6" rx="0.6" fill="${BASS_PICKUP}"/>`,
    `<rect x="-2.6" y="1.6" width="6.4" height="3.6" rx="0.6" fill="${BASS_PICKUP}"/>`,
    `<rect x="-3.2" y="12" width="5.4" height="2.2" fill="${BASS_PICKUP}"/>`,
    `<rect x="-2.4" y="-44" width="4.8" height="31" fill="${BASS_NECK}" stroke="${OUTLINE}" stroke-width="1"/>`,
    ...frets,
    `<polygon points="-2.4,-44 -6,-47.5 -5.6,-56 3.8,-56 2.4,-44" fill="${BASS_NECK}" stroke="${OUTLINE}" stroke-width="1" stroke-linejoin="round"/>`,
    tuners,
  ].join('')}</g>`;
  return { svg, marks };
}

function figure(pose: Pose): { svg: string; marks: Mark[] } {
  // A touch fuller than slim: the reliable big-sister build.
  const d: Dims = { ...DIMS.slim, torsoW: 21, limb: 6.5 };
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
  if (pose.bass === 'set') {
    const b = bassOf(shoulder, 'set');
    parts.push(b.svg);
    marks.push(...b.marks);
  }
  const radii = torsoRadii(d.torsoW).map(n => n * s) as [number, number, number];
  const shell = torsoPoints(hip, shoulder, radii, 2);
  parts.push(poly(shell, OUTLINE));
  parts.push(poly(torsoPoints(hip, shoulder, radii, 0), COLOR));
  for (const pt of shell) marks.push({ x: pt.x, y: pt.y, r: 0 });
  const r = d.headR * s;
  const cx = shoulder.x + Math.sin(pose.lean) * (r + NECK * s);
  const cy = shoulder.y - Math.cos(pose.lean) * (r + NECK * s);
  // Long hair: a cap behind the head plus one strand falling down her back (two when front-facing).
  const strand = (side: number) =>
    `<path d="M ${(cx + side * r * .55).toFixed(1)} ${(cy - r * 1.02).toFixed(1)}
      Q ${(cx + side * r * 1.7).toFixed(1)} ${(cy + r * .8).toFixed(1)} ${(cx + side * r * 1.15).toFixed(1)} ${(cy + r * 3.4).toFixed(1)}
      L ${(cx + side * r * .3).toFixed(1)} ${(cy + r * 3.2).toFixed(1)}
      Q ${(cx + side * r * .8).toFixed(1)} ${(cy + r * 1.2).toFixed(1)} ${(cx + side * r * .25).toFixed(1)} ${(cy - r * .9).toFixed(1)} Z"
      fill="${HAIR}" stroke="${OUTLINE}" stroke-width="1"/>`;
  const cap = `<circle cx="${(cx - (pose.front ? 0 : r * .18)).toFixed(1)}" cy="${(cy - r * .22).toFixed(1)}" r="${(r + 2.2).toFixed(1)}" fill="${HAIR}" stroke="${OUTLINE}" stroke-width="1"/>`;
  parts.push(cap);
  parts.push(strand(pose.front ? -1 : -1));
  if (pose.front) parts.push(strand(1));
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${light}"/>`);
  const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .28 + pose.lean));
  const er = Math.max(2.4, r * .38);
  if (pose.front) {
    for (const side of [-1, 1]) {
      const ex = cx + side * r * .34, ey = cy - r * .06;
      if (pose.lids) parts.push(stroke(ex - er, ey, ex + er, ey, 1.6, OUTLINE));
      else {
        parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(er * .8).toFixed(1)}" fill="${OUTLINE}"/>`);
        parts.push(`<circle cx="${(ex + side * er * .2).toFixed(1)}" cy="${(ey - er * .25).toFixed(1)}" r="${(er * .3).toFixed(1)}" fill="${light}"/>`);
      }
      if (pose.brow) parts.push(stroke(ex - side * er * 1.1, ey - er * 1.7, ex + side * er * .9, ey - er * 1.1, 1.6, OUTLINE));
      if (pose.tear) {
        parts.push(`<path d="M ${(ex + side * er * .2).toFixed(1)} ${(ey + er * 1.6).toFixed(1)} q ${side * er * .5} ${er * 1.4} 0 ${er * 1.9} q ${-side * er * .5} ${-er * .5} 0 ${-er * 1.9}" fill="${TEAR}"/>`);
      }
    }
    const my = cy + r * .52;
    if (pose.smile) parts.push(`<path d="M ${(cx - r * .3).toFixed(1)} ${my.toFixed(1)} Q ${cx.toFixed(1)} ${(my + r * .22).toFixed(1)} ${(cx + r * .3).toFixed(1)} ${my.toFixed(1)}" fill="none" stroke="${OUTLINE}" stroke-width="1.6"/>`);
    else if (pose.roar) parts.push(`<ellipse cx="${cx.toFixed(1)}" cy="${my.toFixed(1)}" rx="${(r * .26).toFixed(1)}" ry="${(r * .4).toFixed(1)}" fill="${OUTLINE}"/>`);
    else if (pose.brow) parts.push(stroke(cx - r * .22, my, cx + r * .22, my, 1.8, OUTLINE));
  } else {
    const ex = cx + r * gaze, ey = cy - r * .08;
    parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${(ex + er * .35).toFixed(1)}" cy="${(ey - er * .2).toFixed(1)}" r="${(er * .38).toFixed(1)}" fill="${light}"/>`);
    if (pose.tear) {
      parts.push(`<path d="M ${(ex + er * .3).toFixed(1)} ${(ey + er * 1.7).toFixed(1)} q ${er * .6} ${er * 1.5} 0 ${er * 2} q ${-er * .6} ${-er * .5} 0 ${-er * 2}" fill="${TEAR}"/>`);
    }
    if (pose.roar) parts.push(`<ellipse cx="${(cx + r * gaze * .8).toFixed(1)}" cy="${(cy + r * .55).toFixed(1)}" rx="${(r * .24).toFixed(1)}" ry="${(r * .36).toFixed(1)}" fill="${OUTLINE}"/>`);
  }
  marks.push({ x: cx, y: cy, r: r + 3 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.bass && pose.bass !== 'set') {
    const b = bassOf(shoulder, pose.bass);
    parts.push(b.svg);
    marks.push(...b.marks);
  }
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + (pose.ox ?? 0)},${CELL - FOOT})`;
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
  [LUNGE, KNEEL, RISE],
  [CROSS_UP, CROSS_DOWN, IDLE],
  [BASS_W, BASS_H, BASS_R],
  [ROAR_W, ROAR_H, ROAR_R],
];

const FRENZY: Pose[][] = [
  [PUNCH_WIND, JAB, CROSS, STANCE],
  [KICK_WIND, HIGH_KICK, ROUND_KICK, STANCE],
  [STANCE, null, null, null],
];

function propSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="#00FF00"/>${body}</svg>\n`;
}

/* A cream eighth note with one tear — the crying bass line. */
const note = propSvg(`
  <rect x="118" y="52" width="11" height="76" fill="#e8c96a" stroke="#151222" stroke-width="3"/>
  <ellipse cx="100" cy="132" rx="28" ry="18" transform="rotate(-28 100 132)" fill="#e8c96a" stroke="#151222" stroke-width="3"/>
  <path d="M129 52 Q172 70 132 100 Q156 72 129 68 Z" fill="#e8c96a" stroke="#151222" stroke-width="3"/>
  <path d="M150 96 q10 18 0 24 q-9 -7 0 -24 Z" fill="#9fd8e8" stroke="#151222" stroke-width="2"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'soyo');

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const frenzy = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => FRENZY[r][c], (c, r) => ['jab', 'kick', 'stance'][r] + '-' + c);

/* Only the reworked I column still regenerates. common/frenzy are finished art (scaled), note is done. */
const targets = ['special.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
console.log('wrote soyo special sheet');

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Yukina. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. Special columns are the firebird (both arms
   flung wide), the rose bloom (arms crossed, then snapped out), the summit shout (head thrown
   back, arms down-splayed) and the black shout (hands to the face, then thrown wide as the
   seal burns off). Hair, costume and face stay out of the block entirely — those come from the
   reference image and the prompt. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
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

/* U: the firebird — arms coiled back-in, then both flung wide in a V as the pillars erupt. */
const BIRD_W: Pose = { lean: -.08, crouch: 4, look: .2, armF: [-.7, -1.4], armB: [-.9, -1.2], legF: [.3, 0], legB: [-.3, 0] };
const BIRD_H: Pose = { lean: -.1, crouch: 2, look: .45, armF: [2.0, -.35], armB: [-2.0, .35], legF: [.45, 0], legB: [-.45, 0] };
/* I: the rose bloom — arms crossed at the chest, then snapped out with the shove. */
const ROSE_W: Pose = { lean: -.05, crouch: 5, look: .1, armF: [.9, 2.1], armB: [-.4, -2.2], legF: [.25, 0], legB: [-.28, 0] };
const ROSE_H: Pose = { lean: -.1, crouch: 2, look: .4, armF: [2.3, -.15], armB: [-2.3, .15], legF: [.4, 0], legB: [-.4, 0] };
/* O: the summit — an inhale with the fists gathered, then the head thrown back mid-shout. */
const SUMMIT_W: Pose = { lean: -.14, crouch: 8, look: -.1, armF: [-.35, -1.7], armB: [-.55, -1.5], legF: [.3, 0], legB: [-.3, 0] };
const SUMMIT_H: Pose = { lean: -.2, crouch: 3, look: -.45, armF: [1.1, .7], armB: [-1.1, -.7], legF: [.5, 0], legB: [-.5, 0] };
/* L: the black shout — hands clutched to the face, then thrown wide as the seal burns off. */
const SHOUT_W: Pose = { lean: .1, crouch: 6, look: -.25, armF: [1.35, 2.2], armB: [1.15, 2.3], legF: [.25, 0], legB: [-.25, 0] };
const SHOUT_H: Pose = { lean: -.16, crouch: 2, look: -.4, armF: [2.4, -.2], armB: [-2.4, .2], legF: [.4, 0], legB: [-.4, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying, look: b.look,
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
const COLOR = '#4455BB';

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
  const light = shade(COLOR, 1.4);
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
  // Head centre is known before anything is drawn.
  const r = d.headR * s;
  const cx = shoulder.x + Math.sin(pose.lean) * (r + NECK * s);
  const cy = shoulder.y - Math.cos(pose.lean) * (r + NECK * s);
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  const radii = torsoRadii(d.torsoW).map(n => n * s) as [number, number, number];
  const shell = torsoPoints(hip, shoulder, radii, 2);
  parts.push(poly(shell, OUTLINE));
  parts.push(poly(torsoPoints(hip, shoulder, radii, 0), COLOR));
  for (const pt of shell) marks.push({ x: pt.x, y: pt.y, r: 0 });
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

const overflows: string[] = [];

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const pt = cellPoint(pose, m);
      const over = Math.max(-pt.x + pt.r, pt.x + pt.r - CELL, -pt.y + pt.r, pt.y + pt.r - CELL);
      if (over > 1) overflows.push(`${label} leaves the cell by ${over.toFixed(1)}px`);
    }
    if (!pose.lying) {
      const top = Math.min(...drawn.marks.map(m => {
        const pt = cellPoint(pose, m);
        return pt.y - pt.r;
      }));
      const height = CELL - FOOT - top;
      if (height < CELL * .45) overflows.push(`${label} is only ${Math.round(height)}px tall`);
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
  if (overflows.length) throw new Error(overflows.join('\n'));
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
  [BIRD_W, BIRD_H, mix(BIRD_H, IDLE, .55)],
  [ROSE_W, ROSE_H, mix(ROSE_H, IDLE, .55)],
  [SUMMIT_W, SUMMIT_H, mix(SUMMIT_H, IDLE, .55)],
  [SHOUT_W, SHOUT_H, mix(SHOUT_H, IDLE, .4)],
];

/* 火鸟 pillar sheet: a 1024×768 summon table of its own, because the flame pillar is the
   whole show of the move and the procedural fx could not carry it. Row 0 erupts, row 1 burns
   (the loop the runtime cycles), row 2 sinks into embers; the last cell stays empty. The
   placeholder stays deliberately neutral — flat rounded columns, no flame details — so the
   img2img pass reads it as position and height rails only, never as a flame to trace. The
   placeholder keeps the transparent background props use (no dark fill), with the magenta
   grid and labels purely as layout rails. */
const PILLAR_SPEC: { h: number; w: number; ember?: boolean }[] = [
  { h: 74, w: 34 },
  { h: 132, w: 36 },
  { h: 186, w: 36 },
  { h: 226, w: 38 },
  { h: 226, w: 38 },
  { h: 214, w: 36 },
  { h: 232, w: 36 },
  { h: 226, w: 38 },
  { h: 128, w: 32 },
  { h: 64, w: 28 },
  { h: 34, w: 22, ember: true },
];

function pillarCellSvg(idx: number): string {
  const spec = PILLAR_SPEC[idx];
  if (!spec) return '';
  const cap = spec.h >= spec.w ? `A ${spec.w} ${spec.w} 0 0 1 ${spec.w} ${-spec.h + spec.w}` : `L ${spec.w} ${-spec.h}`;
  const capIn = spec.h >= spec.w * .55 ? `A ${spec.w * .55} ${spec.w * .55} 0 0 1 ${(spec.w * .55).toFixed(1)} ${(-spec.h + spec.w * .55).toFixed(1)}` : `L ${(spec.w * .55).toFixed(1)} ${-spec.h}`;
  const emberDots = spec.ember
    ? [0, 1, 2].map(i => `<circle cx="${(18 + i * 14).toFixed(1)}" cy="${(-8 - i * 12).toFixed(1)}" r="${(2.5 + i).toFixed(1)}" fill="#ffc24d"/>`).join('')
    : '';
  return `<g transform="translate(${CELL / 2},${CELL})">`
    + `<path d="M ${-spec.w} 0 L ${-spec.w} ${-spec.h + (spec.h >= spec.w ? spec.w : spec.h)} ${cap} L ${spec.w} 0 Z" fill="#ff7a33"/>`
    + `<path d="M ${(-spec.w * .55).toFixed(1)} 0 L ${(-spec.w * .55).toFixed(1)} ${-spec.h + (spec.h >= spec.w * .55 ? spec.w * .55 : spec.h)} ${capIn} L ${(spec.w * .55).toFixed(1)} 0 Z" fill="#ffc24d"/>`
    + `<ellipse cx="0" cy="0" rx="${(spec.w * 1.2).toFixed(1)}" ry="9" fill="#ff7a33"/>`
    + emberDots
    + `</g>`;
}

function pillarSheetSvg(): string {
  const cells: string[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const clip = `p${idx}`;
      const text = `<text x="4" y="13" fill="${GRID}" font-size="10" font-family="monospace">F${idx}</text>`;
      cells.push(`<g transform="translate(${c * CELL},${r * CELL})"><clipPath id="${clip}"><rect width="${CELL}" height="${CELL}"/></clipPath><g clip-path="url(#${clip})">${pillarCellSvg(idx)}</g><rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPECIAL_COLS * CELL}" height="${SPECIAL_ROWS * CELL}" viewBox="0 0 ${SPECIAL_COLS * CELL} ${SPECIAL_ROWS * CELL}">${cells.join('')}</svg>\n`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'yukina');
// common.png, special.png and pillar.png are finished sheets now (placeholder marks gone) —
// all three left the raster list, per SOP. The sheet builders stay for a future --replace re-run.
console.log('yukina sheets are finished art; nothing rasterized (builders kept)');

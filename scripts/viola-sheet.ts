import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Viola only. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. Special columns: the snip (raise, snap, settle),
   the violet (sink, vanish-compact, reappear), the record (raise the recorder, hold, lower) with
   the recorder floating at the chest, and the fuga (draw, full draw, release) with the void bow
   as an arc in front. The arrow and the blast grid are separate props. */

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

/* U: the snip. Hand high with spread fingers, the snap down, then the settle. The cuts are fx. */
const SNIP_W: Pose = { lean: -.06, crouch: 2, look: .45, armF: [2.7, -.2], armB: [.5, -1.3], legF: [.25, 0], legB: [-.25, 0] };
const SNIP_H: Pose = { lean: .14, crouch: 3, look: .55, armF: [1.35, .85], armB: [.7, -.9], legF: [.4, 0], legB: [-.35, 0] };
const SNIP_R: Pose = { lean: 0, crouch: 2, look: .35, armF: [.6, 1.2], armB: [.3, 1.5], legF: [.28, 0], legB: [-.26, 0] };
/* I: the violet. Sink, wrap into the vanish, then step out standing. */
const VIOLET_W: Pose = { lean: -.02, crouch: 20, look: .1, armF: [1.0, 1.4], armB: [.8, 1.6], legF: [.3, 0], legB: [-.3, 0] };
const VIOLET_H: Pose = { lean: .05, crouch: 26, look: -.1, armF: [.9, 2.2], armB: [.7, 2.4], legF: [.38, .5], legB: [-.34, .07] };
const VIOLET_R: Pose = { lean: 0, crouch: 2, look: .35, armF: [.5, 1.6], armB: [.3, 1.8], legF: [.26, 0], legB: [-.24, 0] };
/* O: the record. The recorder rides the front hand — raise it, hold it at the chest, lower it. */
const RECORD_W: Pose = { lean: -.04, crouch: 2, look: .5, armF: [2.3, .3], armB: [.4, -.9], legF: [.24, 0], legB: [-.22, 0] };
const RECORD_H: Pose = { lean: .02, crouch: 3, look: .5, armF: [1.3, .6], armB: [1.1, .9], legF: [.26, 0], legB: [-.24, 0] };
const RECORD_R: Pose = { lean: 0, crouch: 2, look: .35, armF: [.4, 1.2], armB: [.3, 1.4], legF: [.26, 0], legB: [-.24, 0] };
/* L: the fuga. Front arm is the bow arm; the draw hand comes back to the cheek, then lets go. */
const FUGA_W: Pose = { lean: .05, crouch: 4, look: .5, armF: [1.55, .05], armB: [.1, -2.3], legF: [.45, 0], legB: [-.4, 0] };
const FUGA_H: Pose = { lean: .02, crouch: 8, look: .55, armF: [1.5, 0], armB: [-.15, -2.6], legF: [.45, 0], legB: [-.4, 0] };
const FUGA_R: Pose = { lean: -.06, crouch: 2, look: .5, armF: [1.7, -.25], armB: [-.9, -.5], legF: [.5, 0], legB: [-.45, 0] };

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
const COLOR = '#8E5AC8';
const FLAME = '#ffb46a';
const FLAME_HOT = '#ff7a3d';
const PALE = '#f3e8ff';

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

function cell(label: string, pose: Pose | null, col: number, row: number, overlay = ''): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const pt = cellPoint(pose, m);
      const over = Math.max(-pt.x + pt.r, pt.x + pt.r - CELL, -pt.y + pt.r, pt.y + pt.r - CELL);
      if (over > 1) overflows.push(`${label} leaves the cell by ${over.toFixed(1)}px at (${pt.x.toFixed(0)},${pt.y.toFixed(0)}) r=${pt.r.toFixed(1)}`);
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
  return `<g transform="translate(${col * CELL},${row * CELL})"><clipPath id="${clip}"><rect width="${CELL}" height="${CELL}"/></clipPath><g clip-path="url(#${clip})"><rect width="${CELL}" height="${CELL}" fill="${BG}"/>${drawn?.svg ?? ''}${overlay}</g><rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`;
}

function sheet(cols: number, rows: number, poseAt: (c: number, r: number) => Pose | null, labelAt: (c: number, r: number) => string, overlayAt: (c: number, r: number) => string = () => ''): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(cell(labelAt(c, r), poseAt(c, r), c, r, overlayAt(c, r)));
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
  [SNIP_W, SNIP_H, SNIP_R],
  [VIOLET_W, VIOLET_H, VIOLET_R],
  [RECORD_W, RECORD_H, RECORD_R],
  [FUGA_W, FUGA_H, FUGA_R],
];

/** Overlays float at fixed cell spots: they are layout for the img2img prompt, not rigging.
    The recorder is a palm-sized dictaphone slab (no speaker reels); the bow is condensed flame. */
const recorder = (x: number, y: number, rot = 0) =>
  `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="-11" y="-7" width="22" height="14" rx="3" fill="#241c30" stroke="${PALE}" stroke-width="1.5"/><circle cx="-6" cy="0" r="1.6" fill="${PALE}"/><circle cx="-1" cy="0" r="1.6" fill="${PALE}"/><circle cx="4" cy="0" r="1.6" fill="${PALE}"/><rect x="8" y="-3" width="4" height="6" rx="1" fill="${FLAME}"/></g>`;
const flameBow = (x: number, top: number, w: number, op: number) =>
  `<path d="M ${x} ${top} Q ${x + w} ${top + (CELL - FOOT - top) / 2} ${x} ${CELL - FOOT}" fill="none" stroke="${FLAME}" stroke-width="5" opacity="${op}"/>` +
  `<path d="M ${x} ${top + 14} Q ${x + w * .72} ${top + (CELL - FOOT - top) / 2} ${x} ${CELL - FOOT - 14}" fill="none" stroke="${FLAME_HOT}" stroke-width="2.5" opacity="${op * .9}"/>` +
  `<path d="M ${x} ${top} l -7 4 l 9 3 Z" fill="${FLAME_HOT}" opacity="${op}"/>` +
  `<path d="M ${x} ${CELL - FOOT} l -7 -4 l 9 -3 Z" fill="${FLAME_HOT}" opacity="${op}"/>`;

const OVERLAYS: string[][] = [
  ['', '', ''],
  ['', '', ''],
  // O column: the dictaphone rides high, then at the chest, then sinks with the lowering hand.
  [recorder(160, 86, -14), recorder(164, 132, -6), recorder(160, 164, 10)],
  [
    // L column: the flame bow half drawn, then full with a flame arrow nocked, then falling away.
    flameBow(CELL / 2 + 46, CELL - FOOT - 196, 52, .55),
    flameBow(CELL / 2 + 48, 26, 62, 1) + `<line x1="${CELL / 2 + 20}" y1="${CELL - FOOT - 98}" x2="${CELL / 2 + 118}" y2="${CELL - FOOT - 98}" stroke="${FLAME}" stroke-width="4" stroke-linecap="round"/>` + `<path d="M ${CELL / 2 + 126} ${CELL - FOOT - 98} l -12 -6 l 4 6 l -4 6 Z" fill="#fff6d8"/>`,
    flameBow(CELL / 2 + 44, CELL - FOOT - 196, 52, .3) + `<line x1="${CELL / 2 + 30}" y1="${CELL - FOOT - 98}" x2="${CELL / 2 + 96}" y2="${CELL - FOOT - 98}" stroke="${FLAME}" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
  ],
];

function greenCell(body: string, label = ''): string {
  const text = label ? `<text x="6" y="16" fill="${GRID}" font-size="12" font-family="monospace">${label}</text>` : '';
  return `<g><rect width="${CELL}" height="${CELL}" fill="#00FF00"/>${body}<rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`;
}

function greenSheet(cols: number, rows: number, bodyAt: (c: number, r: number) => string, labelAt: (c: number, r: number) => string): string {
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(`<g transform="translate(${c * CELL},${r * CELL})">${greenCell(bodyAt(c, r), labelAt(c, r))}</g>`);
  }
  const w = cols * CELL, h = rows * CELL;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}

const arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="#00FF00"/>` +
  `<line x1="40" y1="128" x2="196" y2="128" stroke="${FLAME_HOT}" stroke-width="10" stroke-linecap="round"/>` +
  `<line x1="46" y1="128" x2="120" y2="128" stroke="#fff6d8" stroke-width="4" stroke-linecap="round"/>` +
  `<path d="M 196 128 L 162 108 L 172 128 L 162 148 Z" fill="${FLAME_HOT}"/>` +
  `<path d="M 60 128 Q 44 96 26 88 Q 52 100 62 122 Z" fill="${FLAME}"/>` +
  `<path d="M 60 128 Q 44 160 26 168 Q 52 156 62 134 Z" fill="${FLAME}"/>` +
  `<circle cx="188" cy="128" r="7" fill="#fff6d8"/>` +
  `</svg>\n`;

/** Twelve blast frames: white core, the fireball swelling with a violet rim, then rings and ash. */
function blastBody(c: number, r: number): string {
  const k = r * 4 + c; // 0..11, row-major, same order the renderer reads
  const cx = CELL / 2, cy = CELL / 2;
  const grow = Math.min(1, (k + 1) / 8);
  const R = 24 + grow * 84;
  if (k === 0) {
    return `<circle cx="${cx}" cy="${cy}" r="34" fill="#fff6d8"/><circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="${FLAME}" stroke-width="6" opacity=".8"/>`;
  }
  if (k <= 7) {
    const spikes = [0, 1, 2, 3, 4, 5].map(i => {
      const a = (i / 6) * Math.PI * 2 + k * .5;
      const r0 = R * .82, r1 = R * (1.06 + .1 * Math.sin(k + i));
      return `<line x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}" stroke="${FLAME_HOT}" stroke-width="7" stroke-linecap="round"/>`;
    }).join('');
    return `<circle cx="${cx}" cy="${cy}" r="${R.toFixed(1)}" fill="${FLAME}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${(R * .58).toFixed(1)}" fill="#fff6d8"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${(R * 1.08).toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="6" opacity="${(1 - grow * .4).toFixed(2)}"/>` +
      spikes;
  }
  const fade = 1 - (k - 8) / 4;
  const ringR = R * (1.1 + (k - 8) * .22);
  const ash = [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
    const a = (i / 8) * Math.PI * 2 + k;
    const rr = ringR * (1.1 + .08 * Math.sin(k * 2 + i));
    return `<circle cx="${(cx + Math.cos(a) * rr).toFixed(1)}" cy="${(cy + Math.sin(a) * rr).toFixed(1)}" r="${(3 + i % 3).toFixed(1)}" fill="#5a4a6a" opacity="${(fade * .9).toFixed(2)}"/>`;
  }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${(R * .5).toFixed(1)}" fill="${FLAME_HOT}" opacity="${(fade * .7).toFixed(2)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${ringR.toFixed(1)}" fill="none" stroke="${COLOR}" stroke-width="${(9 * fade + 1).toFixed(1)}" opacity="${fade.toFixed(2)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(ringR * .7).toFixed(1)}" fill="none" stroke="${FLAME}" stroke-width="${(5 * fade + 1).toFixed(1)}" opacity="${(fade * .8).toFixed(2)}"/>` +
    ash;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'viola');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r], (c, r) => OVERLAYS[c][r]);
const burst = greenSheet(SPECIAL_COLS, SPECIAL_ROWS, blastBody, (c, r) => String(r * 4 + c + 1));
const targets = ['common.png', 'special.png', 'fuga-arrow.png', 'fuga-burst.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'fuga-arrow.png'), arrow, CELL, CELL);
rasterSheet(join(dir, 'fuga-burst.png'), burst, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Dims, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Tomori only. Do not import write-sheets.ts — that script redraws the whole cast.
   ponytail: short hair, so just the cap; the lyrics notebook rides column 4 only.
   All four special columns are side views: img2img models keep failing on a camera column. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number;
  /** Closed lids read on the side view too: 绊创膏 and the daze lean on them. */
  lids?: boolean; roar?: boolean; tear?: boolean;
  /** The lyrics notebook, hugged at the chest. Column 4 recover only. */
  book?: boolean;
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

/* 飞砾谱: bending to the pocket for a stone, the throw, then staring at what is left in her palm. */
const DIG: Pose = { lean: .4, crouch: 24, look: .55, armF: [.8, 1.2], armB: [-.4, -.7], legF: [.5, -.15], legB: [-.45, .1] };
const THROW: Pose = { lean: .32, crouch: 0, look: .58, armF: [1.55, .05], armB: [-.8, -.5], legF: [.55, 0], legB: [-.42, 0] };
const PALM: Pose = { lean: .12, crouch: 6, look: .55, armF: [1.25, 1.0], armB: [.3, 1.4], legF: [.3, 0], legB: [-.26, 0] };

/* 绊创膏: peeling the wrapper with both hands at the chest, the half-crouch with closed eyes, then the daze. */
const PEEL: Pose = { lean: .05, crouch: 4, look: .5, armF: [.95, 1.5], armB: [.75, 1.55], legF: [.28, 0], legB: [-.24, 0] };
const STICK: Pose = { lean: .1, crouch: 34, look: .4, lids: true, armF: [1.3, .5], armB: [.9, 1.25], legF: [.85, -.65], legB: [-.65, -.3] };
const DAZE: Pose = { lean: -.07, crouch: 0, look: .1, armF: [.45, 1.75], armB: [.28, 1.9], legF: [.24, 0], legB: [-.22, 0] };

/* 奇独点: both arms out, fingers curling as the well takes hold, then the stagger back. */
const REACH: Pose = { lean: .18, crouch: 0, look: .58, armF: [1.55, .05], armB: [1.35, -.2], legF: [.45, 0], legB: [-.4, 0] };
const GRABVOID: Pose = { lean: .34, crouch: 8, look: .6, armF: [1.45, .4], armB: [1.3, .2], legF: [.6, -.1], legB: [-.5, 0] };
const STAGGER: Pose = { lean: -.24, crouch: 5, look: -.15, armF: [-.55, -.75], armB: [-.75, -.5], legF: [.7, -.1], legB: [-.55, .2] };

/* 诗超绊: hand on chest, head thrown back mid-note, then hugging the lyrics book again. */
const BREATH: Pose = { lean: .1, crouch: 5, look: .5, armF: [.7, 1.55], armB: [.5, 1.65], legF: [.28, 0], legB: [-.24, 0] };
const SING: Pose = { lean: -.3, crouch: 0, look: .12, roar: true, armF: [2.15, .3], armB: [-.6, -.95], legF: [.35, 0], legB: [-.3, 0] };
const BOW: Pose = { lean: .16, crouch: 8, look: .5, book: true, armF: [.95, 1.35], armB: [.72, 1.5], legF: [.3, 0], legB: [-.26, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
    lids: b.lids, roar: b.roar, tear: b.tear, look: b.look, book: b.book,
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
/* 灯蓝, the official image colour. */
const COLOR = '#77BBDD';
const HAIR = '#9790a4';
const TEAR = '#9fd8e8';

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

function bookOf(shoulder: Pt): { svg: string; marks: Mark[] } {
  const x = shoulder.x + 7, y = shoulder.y + 21;
  const svg = `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(9)">
    <rect x="-14" y="-10" width="28" height="20" rx="2" fill="#f4efe2" stroke="${OUTLINE}" stroke-width="2"/>
    ${stroke(-9, -4, 8, -4, 1.2, '#8a8496')}
    ${stroke(-9, 1, 8, 1, 1.2, '#8a8496')}
    ${stroke(-9, 6, 4, 6, 1.2, '#8a8496')}
  </g>`;
  const corners: Pt[] = [
    { x: x - 15, y: y - 11 }, { x: x + 15, y: y - 9 }, { x: x + 13, y: y + 11 }, { x: x - 17, y: y + 9 },
  ];
  return { svg, marks: corners.map(p => ({ ...p, r: 1 })) };
}

function figure(pose: Pose): { svg: string; marks: Mark[] } {
  // Petite: she is the smallest of the cast.
  const d: Dims = { ...DIMS.slim, torsoW: 19, limb: 6 };
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
  // Short hair: just the cap behind the head.
  parts.push(`<circle cx="${(cx - r * .18).toFixed(1)}" cy="${(cy - r * .22).toFixed(1)}" r="${(r + 2.2).toFixed(1)}" fill="${HAIR}" stroke="${OUTLINE}" stroke-width="1"/>`);
  parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${light}"/>`);
  const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .28 + pose.lean));
  const er = Math.max(2.4, r * .38);
  const ex = cx + r * gaze, ey = cy - r * .08;
  if (pose.lids) {
    parts.push(stroke(ex - er, ey, ex + er, ey, 1.6, OUTLINE));
  } else {
    parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${(ex + er * .35).toFixed(1)}" cy="${(ey - er * .2).toFixed(1)}" r="${(er * .38).toFixed(1)}" fill="${light}"/>`);
  }
  if (pose.tear) {
    parts.push(`<path d="M ${(ex + er * .3).toFixed(1)} ${(ey + er * 1.7).toFixed(1)} q ${er * .6} ${er * 1.5} 0 ${er * 2} q ${-er * .6} ${-er * .5} 0 ${-er * 2}" fill="${TEAR}"/>`);
  }
  if (pose.roar) {
    parts.push(`<ellipse cx="${(cx + r * gaze * .8).toFixed(1)}" cy="${(cy + r * .55).toFixed(1)}" rx="${(r * .24).toFixed(1)}" ry="${(r * .36).toFixed(1)}" fill="${OUTLINE}"/>`);
  }
  marks.push({ x: cx, y: cy, r: r + 3 });
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.book) {
    const b = bookOf(shoulder);
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
  [DIG, THROW, PALM],
  [PEEL, STICK, DAZE],
  [REACH, GRABVOID, STAGGER],
  [BREATH, SING, BOW],
];

function propSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="#00FF00"/>${body}</svg>\n`;
}

/* A grey pebble from the flower bed with one crayon star on it — 天文部, and 金平糖. */
const stone = propSvg(`
  <ellipse cx="128" cy="134" rx="47" ry="36" fill="#b9b2ad" stroke="#151222" stroke-width="4"/>
  <ellipse cx="110" cy="145" rx="21" ry="13" fill="#9b948e"/>
  <path d="M128 102 L146 132 L128 162 L110 132 Z" fill="#77BBDD" stroke="#5d9dbd" stroke-width="2"/>
  <path d="M128 118 L137 132 L128 146 L119 132 Z" fill="#a8d4e6"/>
`);

/* A penguin plaster laid at an angle: adult and chick on the pad, a few star specks. */
const plaster = propSvg(`
  <g transform="translate(128 128) rotate(-24)">
    <rect x="-66" y="-15" width="132" height="30" rx="13" fill="#f7e8da" stroke="#151222" stroke-width="4"/>
    <rect x="-24" y="-17" width="48" height="34" rx="7" fill="#f2ddd0" stroke="#151222" stroke-width="3"/>
    <ellipse cx="-9" cy="-2" rx="8.5" ry="11.5" fill="#2e3140"/>
    <ellipse cx="-9" cy="1" rx="4.8" ry="7" fill="#f7f4ea"/>
    <circle cx="-6.4" cy="-7" r="1.2" fill="#fff"/>
    <polygon points="-14.5,-6.5 -18,-4.8 -14.5,-3.6" fill="#f0a832"/>
    <ellipse cx="11" cy="1" rx="6" ry="8" fill="#5a6274"/>
    <ellipse cx="11" cy="2.5" rx="3.4" ry="4.8" fill="#f7f4ea"/>
    <circle cx="12.8" cy="-2.6" r="1" fill="#fff"/>
    <polygon points="6.8,-2 4.4,-0.8 6.8,0.2" fill="#f0a832"/>
    <rect x="-54" y="-7" width="6" height="6" fill="#77BBDD" transform="rotate(45 -51 -4)"/>
    <rect x="42" y="0" width="5" height="5" fill="#77BBDD" transform="rotate(45 44.5 2.5)"/>
    <rect x="32" y="-11" width="4" height="4" fill="#a8d4e6" transform="rotate(45 34 -9)"/>
  </g>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'tomori');

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);

const targets = ['common.png', 'special.png', 'stone.png', 'plaster.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'common.png'), common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
rasterSheet(join(dir, 'special.png'), special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
rasterSheet(join(dir, 'stone.png'), stone, CELL, CELL);
rasterSheet(join(dir, 'plaster.png'), plaster, CELL, CELL);
console.log('wrote tomori common/special/stone/plaster');

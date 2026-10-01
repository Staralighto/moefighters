import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Kokoro only. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. Special columns are the windmill (one front-facing
   大字; the dash spins that cell six turns), the ship push, the juggle, and the wide smile-wave cast.
   Ship, ball and wave stay separate props. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; star?: boolean;
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

/* U: one front-facing 大字. The three cells match; SpriteView spins the cell six turns. */
const STAR: Pose = { lean: 0, crouch: 0, armF: [0, 0], armB: [0, 0], legF: [0, 0], legB: [0, 0], star: true };
/* I: the ship launch. Chambered low, both hands shoved forward, then the open presentation. */
const SHIP_W: Pose = { lean: -.1, crouch: 6, look: .45, armF: [-.6, -1.6], armB: [-.5, -1.2], legF: [.3, 0], legB: [-.3, 0] };
const SHIP_H: Pose = { lean: .18, crouch: 4, look: .55, armF: [1.4, -.1], armB: [1.25, -.2], legF: [.5, 0], legB: [-.4, 0] };
const SHIP_R: Pose = { lean: -.04, crouch: 3, look: .5, armF: [2.2, -.3], armB: [1.2, .8], legF: [.3, 0], legB: [-.3, 0] };
/* O: the juggle. One hand tossing high, both hands weaving, the catch back at the chest. */
const JUG_W: Pose = { lean: -.02, crouch: 2, look: .5, armF: [2.5, -.3], armB: [.3, 1.2], legF: [.28, 0], legB: [-.28, 0] };
const JUG_H: Pose = { lean: .04, crouch: 5, look: .5, armF: [2.55, .5], armB: [-2.5, -.5], legF: [.3, 0], legB: [-.3, 0] };
const JUG_R: Pose = { lean: .1, crouch: 10, look: .45, armF: [1.0, .6], armB: [-.4, .8], legF: [.3, 0], legB: [-.28, 0] };
/* L: the smile-wave cast. Wide open, both arms thrown up, then the held finish. */
const WAVE_W: Pose = { lean: -.05, crouch: 2, look: .5, armF: [1.8, -.4], armB: [-1.6, .4], legF: [.3, 0], legB: [-.3, 0] };
const WAVE_H: Pose = { lean: .05, crouch: 2, look: .55, armF: [2.5, -.2], armB: [-2.4, .2], legF: [.15, 0], legB: [-.15, 0] };
const WAVE_R: Pose = { lean: .02, crouch: 3, look: .55, armF: [2.55, .3], armB: [.3, 1.4], legF: [.26, 0], legB: [-.24, 0] };

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
const COLOR = '#FFEE22';

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

/** Front-facing 大字, centred so a 360° spin stays inside the cell. Two eyes: this cell faces the camera. */
function starFigure(): { svg: string; marks: Mark[] } {
  const light = shade(COLOR, 1.35);
  const w = 16;
  const parts: string[] = [];
  const marks: Mark[] = [];
  const limb = (x1: number, y1: number, x2: number, y2: number) => {
    parts.push(stroke(x1, y1, x2, y2, w + 6, OUTLINE));
    parts.push(stroke(x1, y1, x2, y2, w, COLOR));
    marks.push({ x: x1, y: y1, r: (w + 6) / 2 }, { x: x2, y: y2, r: (w + 6) / 2 });
  };
  limb(0, 6, -48, 78);
  limb(0, 6, 48, 78);
  limb(0, -22, -72, -78);
  limb(0, -22, 72, -78);
  parts.push(stroke(0, -22, 0, 6, w + 8, OUTLINE));
  parts.push(stroke(0, -22, 0, 6, w + 2, COLOR));
  const r = 22;
  const cy = -22 - r - 6;
  parts.push(`<circle cx="0" cy="${cy}" r="${r + 3}" fill="${OUTLINE}"/>`);
  parts.push(`<circle cx="0" cy="${cy}" r="${r}" fill="${light}"/>`);
  for (const dx of [-8, 8]) {
    parts.push(`<circle cx="${dx}" cy="${cy - 1}" r="5.5" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${dx + 1.6}" cy="${cy - 2.6}" r="2" fill="${light}"/>`);
  }
  marks.push({ x: 0, y: cy, r: r + 3 }, { x: -72, y: -78, r: 11 }, { x: 72, y: -78, r: 11 }, { x: -48, y: 78, r: 11 }, { x: 48, y: 78, r: 11 });
  return { svg: `<g transform="translate(${CELL / 2},${CELL / 2})">${parts.join('')}</g>`, marks };
}

function figure(pose: Pose): { svg: string; marks: Mark[] } {
  if (pose.star) return starFigure();
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
  if (pose.star) return { x: CELL / 2 + m.x, y: CELL / 2 + m.y, r: m.r };
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
  [STAR, STAR, STAR],
  [SHIP_W, SHIP_H, SHIP_R],
  [JUG_W, JUG_H, JUG_R],
  [WAVE_W, WAVE_H, WAVE_R],
];

function propSvg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

/* 微笑号: a chunky white cruise facing right, yellow decks, the bow grin. */
const ship = propSvg(512, 256, `
  <rect x="60" y="120" width="390" height="70" rx="18" fill="#f6f2ea" stroke="#151222" stroke-width="5"/>
  <path d="M60 138 L28 158 L60 186 Z" fill="#f6f2ea" stroke="#151222" stroke-width="5" stroke-linejoin="round"/>
  <rect x="96" y="176" width="330" height="16" fill="#d94455"/>
  <rect x="130" y="76" width="200" height="46" rx="10" fill="#ffd94f" stroke="#151222" stroke-width="5"/>
  <rect x="160" y="42" width="120" height="36" rx="8" fill="#ffd94f" stroke="#151222" stroke-width="5"/>
  <rect x="342" y="52" width="26" height="46" rx="6" fill="#d94455" stroke="#151222" stroke-width="5"/>
  <circle cx="118" cy="150" r="17" fill="none" stroke="#151222" stroke-width="5"/>
  <circle cx="113" cy="146" r="3" fill="#151222"/>
  <circle cx="124" cy="146" r="3" fill="#151222"/>
  <path d="M110 154 Q118 162 127 153" fill="none" stroke="#151222" stroke-width="4" stroke-linecap="round"/>
  <rect x="180" y="90" width="24" height="18" fill="#8fd0e8" stroke="#151222" stroke-width="3"/>
  <rect x="216" y="90" width="24" height="18" fill="#8fd0e8" stroke="#151222" stroke-width="3"/>
  <rect x="252" y="90" width="24" height="18" fill="#8fd0e8" stroke="#151222" stroke-width="3"/>
  <rect x="180" y="122" width="24" height="18" fill="#8fd0e8" stroke="#151222" stroke-width="3"/>
  <rect x="216" y="122" width="24" height="18" fill="#8fd0e8" stroke="#151222" stroke-width="3"/>
  <rect x="252" y="122" width="24" height="18" fill="#8fd0e8" stroke="#151222" stroke-width="3"/>
`);

/* 抛球杂耍: a red-and-white beach ball with the top cap. */
const ball = propSvg(CELL, CELL, `
  <circle cx="128" cy="132" r="86" fill="#f6f2ea" stroke="#151222" stroke-width="5"/>
  <path d="M128 46 C 88 90 88 174 128 218 C 108 174 108 90 128 46 Z" fill="#d94455"/>
  <path d="M128 46 C 168 90 168 174 128 218 C 148 174 148 90 128 46 Z" fill="#d94455" transform="rotate(90 128 132)"/>
  <path d="M128 46 C 168 90 168 174 128 218 C 148 174 148 90 128 46 Z" fill="#d94455" transform="rotate(-90 128 132)"/>
  <circle cx="128" cy="132" r="86" fill="none" stroke="#151222" stroke-width="5"/>
  <circle cx="128" cy="46" r="16" fill="#ffd94f" stroke="#151222" stroke-width="5"/>
`);

/* 世界微笑: a golden grin riding a stacked wave arc. */
const wave = propSvg(CELL, CELL, `
  <path d="M28 128 Q 88 66 148 96 Q 208 126 228 96" fill="none" stroke="#ffd94f" stroke-width="12" stroke-linecap="round"/>
  <path d="M44 158 Q 104 96 164 126 Q 224 156 244 126" fill="none" stroke="#ffd94f" stroke-width="9" stroke-linecap="round" opacity=".75"/>
  <path d="M60 188 Q 120 126 180 156 Q 240 186 252 170" fill="none" stroke="#ffd94f" stroke-width="6" stroke-linecap="round" opacity=".5"/>
  <circle cx="128" cy="118" r="58" fill="#ffd94f" stroke="#151222" stroke-width="5"/>
  <circle cx="108" cy="106" r="7" fill="#151222"/>
  <circle cx="148" cy="106" r="7" fill="#151222"/>
  <path d="M100 128 Q 128 152 156 128" fill="none" stroke="#151222" stroke-width="6" stroke-linecap="round"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'kokoro');
/* ship.png and wave.png are finished art (mark gone) and left the raster list, per SOP. */
const targets = ['ball.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'ball.png'), ball, CELL, CELL);

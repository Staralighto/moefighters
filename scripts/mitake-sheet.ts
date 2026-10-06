import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, PHASES, SPECIAL_COLS, SPECIAL_KEYS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block 美竹兰 (mitake). Do not import write-sheets.ts — that script redraws the whole cast.
   Three tables: common 8×3, special 4×3 (U 花道·缠 / I 不良主唱 / O 像以前一样 / L 宣战布告),
   and the frenzy sheet 4×3 the 宣战布告 form swaps in (row 0 light flurry, row 1 kicks, row 2 idle).
   The guitar is a separate picture. Column I is the downward smash: lean back, then drive both arms down. Hair and costume stay out. */

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

/* U 花道·缠: draw the branch back, then fling it forward. */
const HANA_W: Pose = { lean: -.08, crouch: 3, look: .1, armF: [-.7, -1.3], armB: [.6, -1.0], legF: [.3, 0], legB: [-.3, 0] };
const HANA_H: Pose = { lean: .2, crouch: 2, look: .55, armF: [1.5, -.1], armB: [-.6, -.8], legF: [.45, 0], legB: [-.35, 0] };
/* I 不良主唱: lean back to load, then hinge forward and drive both arms down. No guitar on the sheet. */
const SMASH_W: Pose = { lean: -.48, crouch: 2, look: -.45, armF: [3.55, .2], armB: [3.35, .25], legF: [.15, 0], legB: [-.45, .05] };
const SMASH_H: Pose = { lean: .62, crouch: 20, look: .62, armF: [.42, -.08], armB: [.32, -.05], legF: [.7, -.25], legB: [-.2, .05] };
const SMASH_R: Pose = { lean: .22, crouch: 8, look: .4, armF: [.85, -.1], armB: [.7, -.08], legF: [.45, -.05], legB: [-.25, 0] };
/* O 像以前一样: fold in, then a wide red ring. */
const USUAL_W: Pose = { lean: -.12, crouch: 13, look: -.05, armF: [.85, -1.5], armB: [.6, -1.4], legF: [.4, 0], legB: [-.35, 0] };
const USUAL_H: Pose = { lean: .06, crouch: 2, look: .5, armF: [1.95, .25], armB: [-1.95, .25], legF: [.5, 0], legB: [-.4, 0] };
/* L 宣战布告: fists gathered at the chest, then both arms thrown straight up. Not the O ring. */
const DECL_W: Pose = { lean: .06, crouch: 10, look: -.2, armF: [.7, 2.15], armB: [.45, 2.25], legF: [.32, 0], legB: [-.28, 0] };
const DECL_H: Pose = { lean: -.2, crouch: 0, look: -.5, armF: [2.85, .12], armB: [3.15, -.08], legF: [.26, 0], legB: [-.26, 0] };

/* 狂化 J/K on the frenzy sheet. Row 0 is the light flurry, row 1 the kicks, row 2 the idle stance
   at column 0 only — that is the cell layout soyoFrenzyFrame reads. */
const FRZ_PUNCH_W: Pose = { lean: -.05, crouch: 3, armF: [-.5, -1.7], armB: [.7, -1.3], legF: [.3, 0], legB: [-.3, 0] };
const FRZ_PUNCH_1: Pose = { lean: .14, crouch: 2, look: .5, armF: [1.45, -.05], armB: [.3, -1.6], legF: [.4, 0], legB: [-.35, 0] };
const FRZ_PUNCH_2: Pose = { lean: .18, crouch: 2, look: .5, armF: [1.2, -.5], armB: [1.4, -.4], legF: [.45, 0], legB: [-.4, 0] };
const FRZ_PUNCH_R: Pose = { lean: .1, crouch: 4, look: .45, armF: [.9, -1.0], armB: [.6, -1.2], legF: [.35, 0], legB: [-.3, 0] };
const FRZ_KICK_W: Pose = { lean: -.08, crouch: 4, armF: [.5, -1.5], armB: [.8, -1.3], legF: [-.5, .8], legB: [0, 0] };
const FRZ_KICK_1: Pose = { lean: -.32, crouch: 0, look: .5, armF: [-.5, -1.0], armB: [1.1, -.9], legF: [1.9, .1], legB: [-.12, 0] };
const FRZ_KICK_2: Pose = { lean: -.08, crouch: 0, look: .5, armF: [-.9, -.5], armB: [1.35, -.4], legF: [1.45, .55], legB: [-.15, 0] };
const FRZ_KICK_R: Pose = { lean: -.12, crouch: 5, look: .4, armF: [.4, -1.2], armB: [.9, -1.1], legF: [.7, .3], legB: [-.3, 0] };
const FRZ_IDLE: Pose = { lean: -.06, crouch: 3, look: .4, armF: [1.1, -1.0], armB: [-.9, -.9], legF: [.4, 0], legB: [-.4, 0] };

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
const COLOR = '#EE0022';

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
      const top = Math.min(...drawn.marks.map(m => cellPoint(pose, m).y - m.r));
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
  [HANA_W, HANA_H, mix(HANA_H, IDLE, .55)],
  [SMASH_W, SMASH_H, SMASH_R],
  [USUAL_W, USUAL_H, mix(USUAL_H, IDLE, .55)],
  [DECL_W, DECL_H, mix(DECL_H, IDLE, .4)],
];

const FRENZY: (Pose | null)[][] = [
  [FRZ_PUNCH_W, FRZ_PUNCH_1, FRZ_PUNCH_2, FRZ_PUNCH_R],
  [FRZ_KICK_W, FRZ_KICK_1, FRZ_KICK_2, FRZ_KICK_R],
  [FRZ_IDLE, null, null, null],
];
const FRENZY_LABELS = ['frzL0', 'frzL1', 'frzL2', 'frzL3', 'frzH0', 'frzH1', 'frzH2', 'frzH3', 'frzIdle', '', '', ''];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'mitake');

/* Grip sits on the image center. Local +y is the round bout and points right; the neck stays in the left half. */
function guitarSvg(): string {
  const S = 4.2;
  const ox = 256;
  const oy = 128;
  const GRIP_Y = -36;
  const at = (x: number, y: number) => ({ x: ox + (y - GRIP_Y) * S, y: oy + x * S });
  const pts = (list: Pt[]) => list.map(p => { const q = at(p.x, p.y); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ');
  const body: Pt[] = [
    { x: -3.2, y: -13 }, { x: -8, y: -8 }, { x: -13.5, y: -12 }, { x: -15, y: -5 }, { x: -12.5, y: 2 }, { x: -14, y: 11 },
    { x: -7, y: 16.5 }, { x: 1, y: 18 }, { x: 10, y: 15 }, { x: 14.5, y: 7 }, { x: 15, y: 0 }, { x: 12.5, y: -6 }, { x: 8, y: -11 }, { x: 4.2, y: -7 }, { x: 3.2, y: -13 },
  ];
  const guard: Pt[] = [
    { x: -1, y: -9 }, { x: 3.2, y: -11 }, { x: 9, y: -6 }, { x: 11.5, y: 2 }, { x: 10, y: 12 }, { x: 3, y: 15.2 }, { x: -5, y: 13 }, { x: -9, y: 5 }, { x: -6, y: -2 },
  ];
  const box = (x: number, y: number, w: number, h: number) => [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
  ];
  const neck = box(-2.2, -38, 4.4, 26);
  const head: Pt[] = [
    { x: -2.2, y: -38 }, { x: -6.2, y: -41.5 }, { x: -6, y: -47 }, { x: 3.8, y: -47 }, { x: 2.2, y: -38 },
  ];
  const frets = [-18, -24, -30].map(y => {
    const a = at(-2, y);
    const b = at(2, y);
    return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${MAPLE}" stroke-width="2"/>`;
  }).join('');
  const tuners = [-41.2, -43.4, -45.4].map(y => {
    const c = at(-5.6, y);
    return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5" fill="${PICKUP}"/>`;
  }).join('');
  const fill = (list: Pt[], color: string, stroke = '') =>
    `<polygon points="${pts(list)}" fill="${color}"${stroke}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256" viewBox="0 0 512 256">${[
    fill(body, COLOR, ` stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"`),
    fill(guard, GUARD),
    fill(box(-1.4, -5, 7, 3.2), PICKUP),
    fill(box(-1.4, 2.2, 7, 3.2), PICKUP),
    fill(neck, MAPLE, ` stroke="${OUTLINE}" stroke-width="2"`),
    fill(head, MAPLE, ` stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"`),
    frets,
    tuners,
  ].join('')}</svg>\n`;
}

const GUARD = '#f3e6d0';
const PICKUP = '#2a2230';
const MAPLE = '#c4a36a';

/* common/special/frenzy/guitar are finished art (mark gone) and left the raster list, per SOP.
   sheet() and guitarSvg() stay for a future re-run. guitar.png is the 2048×1024 picture. */
console.log('mitake sheets are finished art; nothing rasterized (builders kept)', dir);

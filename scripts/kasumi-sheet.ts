import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Kasumi only. Do not import write-sheets.ts — that script redraws the whole cast.
   Common poses are the shared set, empty-handed. Special columns are the star strum (the Random
   Star guitar outline rides the U cells: star body, neck and headstock at real proportions —
   the img2img pass copies whatever silhouette this block carries), the round-formation beckon,
   the hug, and the prayer. Hair, costume and face stay out of the block entirely — those come
   from the reference image and the prompt. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; guitar?: boolean;
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

/* U: the Random Star stays strung across the body; the three frames are the strum. */
const STAR_W: Pose = { lean: -.06, crouch: 2, look: .3, armF: [1.15, -.55], armB: [.75, .5], legF: [.25, 0], legB: [-.28, 0], guitar: true };
const STAR_H: Pose = { lean: .02, crouch: 1, look: .35, armF: [1.32, -.2], armB: [.95, .3], legF: [.25, 0], legB: [-.28, 0], guitar: true };
const STAR_R: Pose = { lean: -.02, crouch: 2, look: .3, armF: [1.05, .4], armB: [.8, .8], legF: [.25, 0], legB: [-.26, 0], guitar: true };
/* I: the round-formation beckon — back leg hooked, then the arm swings out with the call. */
const POPPA_W: Pose = { lean: -.1, crouch: 6, look: .4, armF: [-.5, -1.2], armB: [.6, -1.0], legF: [-.5, 1.1], legB: [.2, 0] };
const POPPA_H: Pose = { lean: .18, crouch: 3, look: .55, armF: [1.57, 0], armB: [.4, -1.5], legF: [.4, 0], legB: [-.6, .3] };
const POPPA_R: Pose = { lean: .04, crouch: 2, look: .35, armF: [.4, 1.1], armB: [.15, -1.0], legF: [.28, 0], legB: [-.3, 0] };
/* O: the hug — arms open on the lunge, wrapped tight through the nuzzles, then content. */
const HUG_W: Pose = { lean: .2, crouch: 6, look: .3, armF: [1.35, -.35], armB: [1.05, -.15], legF: [.35, 0], legB: [-.3, 0] };
const HUG_H: Pose = { lean: .26, crouch: 4, look: .15, armF: [1.5, .8], armB: [1.35, .95], legF: [.32, 0], legB: [-.28, 0] };
const HUG_R: Pose = { lean: .3, crouch: 8, look: -.05, armF: [1.25, 1.5], armB: [1.1, 1.6], legF: [.3, 0], legB: [-.26, 0] };
/* L: the prayer — hands together and head bowed, held through the cast, then arms spread at the sky. */
const WISH_W: Pose = { lean: -.02, crouch: 2, look: -.1, armF: [1.1, .85], armB: [.9, 1.05], legF: [.22, 0], legB: [-.22, 0] };
const WISH_H: Pose = { lean: -.06, crouch: 3, look: -.15, armF: [1.2, .95], armB: [1.0, 1.15], legF: [.22, 0], legB: [-.22, 0] };
const WISH_R: Pose = { lean: -.12, crouch: 0, look: .55, armF: [2.3, -.5], armB: [-2.2, -.3], legF: [.3, 0], legB: [-.3, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying, look: b.look,
    guitar: a.guitar && b.guitar,
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
const COLOR = '#FF5522';
const CREAM = '#f4ead8';

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

/** Five-point star as a filled polygon, point up, centred at (cx, cy). */
function star(cx: number, cy: number, r: number, fill: string, edge?: string, inner = .42, rot = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    const rad = i % 2 ? r * inner : r;
    pts.push(`${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"${edge ? ` stroke="${edge}" stroke-width="2.5" stroke-linejoin="round"` : ''}/>`;
}

/** End of a two-segment limb from the shoulder, for propping the guitar against the hands. */
function limbEnd(shoulder: Pt, [a1, a2]: Limb, d: { upperArm: number; foreArm: number }, s: number): Pt {
  const mid = { x: shoulder.x + Math.sin(a1) * d.upperArm * s, y: shoulder.y + Math.cos(a1) * d.upperArm * s };
  return { x: mid.x + Math.sin(a1 + a2) * d.foreArm * s, y: mid.y + Math.cos(a1 + a2) * d.foreArm * s };
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
  if (pose.guitar) {
    // The Random Star: star body down in front of the strum hand, neck up to the fretting hand.
    // The outline is what img2img copies, so it carries the whole instrument: star body, neck,
    // headstock and pickup at real proportions.
    const fret = limbEnd(shoulder, pose.armF, d, s);
    const strum = limbEnd(shoulder, pose.armB, d, s);
    const bx = (strum.x + fret.x) / 2 + 14, by = (strum.y + fret.y) / 2 + 26;
    const nx = bx + (fret.x - bx) * 1.18, ny = by + (fret.y - by) * 1.18;
    parts.push(stroke(bx, by, fret.x, fret.y, 6 * s * .55, OUTLINE));
    const headW = 7, headH = 16;
    const ang = Math.atan2(fret.y - by, fret.x - bx);
    const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
    const hx1 = nx + px * headW, hy1 = ny + py * headW;
    const hx2 = nx - px * headW, hy2 = ny - py * headW;
    const tx = nx + Math.cos(ang) * headH, ty = ny + Math.sin(ang) * headH;
    parts.push(`<polygon points="${hx1.toFixed(1)},${hy1.toFixed(1)} ${hx2.toFixed(1)},${hy2.toFixed(1)} ${(tx - px * 3).toFixed(1)},${(ty - py * 3).toFixed(1)} ${(tx + px * 3).toFixed(1)},${(ty + py * 3).toFixed(1)}" fill="${OUTLINE}"/>`);
    marks.push({ x: fret.x, y: fret.y, r: 5 }, { x: tx, y: ty, r: 6 });
    parts.push(star(bx, by, 30, COLOR, OUTLINE, .5, .12));
    parts.push(`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="5.5" fill="${CREAM}"/>`);
    marks.push({ x: bx, y: by, r: 30 });
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
  [STAR_W, STAR_H, STAR_R],
  [POPPA_W, POPPA_H, POPPA_R],
  [HUG_W, HUG_H, HUG_R],
  [WISH_W, WISH_H, WISH_R],
];

function propSvg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

/* 小星星: one star sprite shared by the rain and the wish — gold body, thin dark edge,
   pale core sitting up-left of centre, matching the old procedural draw in fx.ts. */
const starProp = propSvg(CELL, CELL, `
  <polygon points="128,8 157.6,87.2 242.1,90.9 175.9,143.6 198.5,225.1 128,178.4 57.5,225.1 80.1,143.6 13.9,90.9 98.4,87.2"
    fill="#ffd257" stroke="#b46a1e" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="114" cy="110" r="14" fill="#fffbe0"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'kasumi');
// common.png and special.png are finished sheets now (placeholder marks gone) — both left the
// raster list, per SOP. The sheet builders stay for a future --replace re-run.
const targets = ['star.png'].map(name => join(dir, name));
assertAllWritable(targets);
rasterSheet(join(dir, 'star.png'), starProp, CELL, CELL);

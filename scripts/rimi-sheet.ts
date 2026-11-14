import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 牛込里美 (rimi). Do not import write-sheets.ts.
   Special columns: U 今晚放映恐怖片 (bending forward, both hands down in front, setting something on the floor / leaning
   in and clapping, excited / one hand over her mouth, giggling), I 巧克力螺，请收下！ (both hands cupped at the chest /
   both arms flung forward and up, scattering / hands clasped at the chest, happy), O 告一段"螺" (both arms forward at
   chest height, holding something up / leaning far in, a long stride, both arms driving forward / tipping back, arms
   out, dizzy), L 我的心是巧克力螺 (both hands at her mouth, a big bite / popping up, both arms flung overhead / sitting on
   the floor, legs out, one hand over her mouth, the other propping her up). The cornets, the TV, the ghost and every
   effect are fx or prop pictures (src/render/rimiFx.ts), so none appear in these cells. All empty-handed.
   Four prop placeholders (256, transparent) until the art comes in:
     cornet.png       a chocolate cornet lying on its side, tip to the right, the open end (chocolate) to the left;
     cornet-rimi.png  the same cornet, with her black bangs and a pink hairclip peeking out of the open end;
     tv.png           an old CRT TV in three-quarter view, screen toward the right, grey static on it, feet at y 232;
     ghost.png        a little long-haired ghost crawling to the right, prone, black hair over its face, white dress.
   Common poses use the standard template, except the ground heavy: a backhand tsukkomi chop (关西腔吐槽) instead of
   the kick. Colour blocks only: hair, clothes and shoes belong to the img2img prompt.
   `--svg <dir>` writes the SVGs there instead (for a machine without Chrome to rasterize). */

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
  /** Kept for the shared figure(); unused here. */
  stick?: boolean;
  /** Body build: 牛込里美 is the slim one (150 cm, the smallest of Poppin'Party). */
  build?: 'slim' | 'tall';
  /** A guitar slung across the hips, body forward of the hip, neck rising forward. */
  guitar?: boolean;
  /** family.png props: a bass (a guitar with a long neck), a keyboard held in both hands. */
  bass?: boolean;
  keys?: boolean;
  cushion?: boolean;
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
const GUITAR_BODY = '#3d6fb8';
const GUITAR_NECK = '#c9a26b';
const COLOR = '#FF55BB';
const CUSHION = '#f6d9ee';

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
  const d = DIMS[pose.build ?? 'slim'];
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
  // A drumstick continues out of the hand along the forearm direction.
  const stickIn = (from: Pt, [a1, a2]: Limb) => {
    const u = d.upperArm * s, f = d.foreArm * s;
    const hx = from.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = from.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const len = f * 1.5;
    const tx = hx + Math.sin(a1 + a2) * len, ty = hy + Math.cos(a1 + a2) * len;
    parts.push(stroke(hx, hy, tx, ty, 4, OUTLINE));
    marks.push({ x: tx, y: ty, r: 3 });
  };
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  if (pose.stick) stickIn(shoulder, pose.armB);
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
  if (pose.guitar || pose.bass) {
    // Body just ahead of the hip, neck rising forward past the chest. A bass has the longer neck.
    const gx = hip.x + 14, gy = hip.y - 2;
    const reach = pose.bass ? 1.45 : 1;
    const nx = gx + 74 * reach, ny = gy - 46 * reach;
    parts.push(stroke(gx, gy, nx, ny, 9, OUTLINE));
    parts.push(stroke(gx, gy, nx, ny, 5, GUITAR_NECK));
    parts.push(`<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="22" ry="17" transform="rotate(-32 ${gx.toFixed(1)} ${gy.toFixed(1)})" fill="${GUITAR_BODY}" stroke="${OUTLINE}" stroke-width="3"/>`);
    marks.push({ x: gx, y: gy, r: 24 }, { x: nx, y: ny, r: 6 });
  }
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, base);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, base);
  if (pose.keys) {
    // A keyboard held across both hands: a long bar with white keys, tilted with the front forearm.
    const u = d.upperArm * s, f = d.foreArm * s;
    const [a1, a2] = pose.armF;
    const hx = shoulder.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = shoulder.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const ang = Math.atan2(Math.cos(a1 + a2), Math.sin(a1 + a2)) * 180 / Math.PI;
    parts.push(`<g transform="translate(${hx.toFixed(1)},${hy.toFixed(1)}) rotate(${ang.toFixed(1)})"><rect x="-44" y="-9" width="80" height="18" fill="#2a2440" stroke="${OUTLINE}" stroke-width="3"/><rect x="-40" y="-3" width="72" height="9" fill="#f4f0ff"/></g>`);
    const cs = Math.cos(ang * Math.PI / 180), sn = Math.sin(ang * Math.PI / 180);
    for (const [px, py] of [[-44, -9], [36, -9], [-44, 9], [36, 9]]) marks.push({ x: hx + px * cs - py * sn, y: hy + px * sn + py * cs, r: 2 });
  }
  if (pose.cushion) {
    // A round cushion hugged at the chest, just ahead of the torso.
    const cx2 = shoulder.x + 14, cy2 = shoulder.y + 22;
    parts.push(`<ellipse cx="${cx2.toFixed(1)}" cy="${cy2.toFixed(1)}" rx="20" ry="17" fill="${CUSHION}" stroke="${OUTLINE}" stroke-width="3"/>`);
    marks.push({ x: cx2 + 21, y: cy2, r: 2 }, { x: cx2, y: cy2 + 18, r: 2 }, { x: cx2, y: cy2 - 18, r: 2 });
  }
  if (pose.stick) stickIn(shoulder, pose.armF);
  const ox = pose.ox ?? 0;
  const origin = pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT + (pose.oy ?? 0)})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (!pose.lying) return { x: CELL / 2 + (pose.ox ?? 0) + m.x, y: CELL - FOOT + (pose.oy ?? 0) + m.y, r: m.r };
  const sx = m.x * 0.78, sy = m.y * 0.78;
  return { x: CELL - 16 + sy, y: CELL / 2 - sx, r: m.r * 0.78 };
}

function cell(label: string, pose: Pose | null, col: number, row: number, base: string): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose, base) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px at ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
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



/* ---- U 今晚放映恐怖片 ---- */
const SET_DOWN: Pose = { lean: .55, crouch: 22, look: .3, neck: .2, armF: [.75, .15], armB: [.6, .2], legF: legAbs(.9, -.35, 22), legB: legAbs(-.1, -.95, 22) };
const CLAP: Pose = { lean: .16, crouch: 4, look: .55, armF: [1.15, 1.35], armB: [1.05, 1.45], legF: [.3, 0], legB: [-.25, 0] };
const GIGGLE: Pose = { lean: -.04, crouch: 2, look: .3, neck: .2, armF: [.55, 2.55], armB: [.15, .4], legF: [.18, 0], legB: [-.16, 0] };
/* ---- I 巧克力螺，请收下！ ---- */
const CUP: Pose = { lean: -.05, crouch: 6, look: .35, armF: [.95, 1.55], armB: [.85, 1.65], legF: [.22, 0], legB: [-.2, 0] };
const SCATTER: Pose = { lean: .14, crouch: 2, look: .65, neck: -.15, armF: [2.2, .3], armB: [2.0, .4], legF: [.5, 0], legB: [-.35, 0] };
const HAPPY: Pose = { lean: -.02, crouch: 0, look: .45, armF: [.85, 2.05], armB: [.8, 2.1], legF: [.16, 0], legB: [-.14, 0] };
/* ---- O 告一段"螺" ---- */
const HOLD_UP: Pose = { lean: -.08, crouch: 4, look: .45, armF: [1.55, .25], armB: [1.45, .35], legF: [.3, 0], legB: [-.3, 0] };
const DRIVE: Pose = { lean: .38, crouch: 12, look: .55, neck: .1, armF: [1.5, .1], armB: [1.4, .15], legF: [.75, -.1], legB: [-.75, .25] };
const DIZZY: Pose = { lean: -.22, crouch: 4, look: .1, armF: [1.05, .35], armB: [-.55, .3], legF: [.35, 0], legB: [-.35, 0] };
/* ---- L 我的心是巧克力螺 ---- */
const BITE: Pose = { lean: .06, crouch: 2, look: .4, armF: [.75, 2.55], armB: [.65, 2.6], legF: [.2, 0], legB: [-.18, 0] };
const POP: Pose = { lean: -.05, crouch: 0, look: .5, neck: -.2, armF: [2.8, .2], armB: [2.6, .3], legF: [.35, 0], legB: [-.35, 0] };
const SIT: Pose = { lean: -.18, crouch: 88, look: .3, armF: [.5, 2.55], armB: [-.75, .15], legF: legAbs(1.5, 1.5, 88), legB: legAbs(1.4, 1.62, 88) };

const SPECIAL: Pose[][] = [
  [SET_DOWN, CLAP, GIGGLE],
  [CUP, SCATTER, HAPPY],
  [HOLD_UP, DRIVE, DIZZY],
  [BITE, POP, SIT],
];
/* ---- K 关西腔吐槽: a backhand chop instead of the kick ---- */
const CHOP_WIND: Pose = { lean: -.12, crouch: 4, look: .4, armF: [2.5, -1.1], armB: [.5, .5], legF: [.3, 0], legB: [-.3, 0] };
const CHOP_HIT: Pose = { lean: .2, crouch: 4, look: .6, armF: [1.6, .05], armB: [.35, .6], legF: [.55, 0], legB: [-.4, 0] };

/** A chocolate cornet, tip right, open end left, in a 256 cell; `bangs` adds her bangs and clip peeking out. */
function cornetSvg(bangs: boolean): string {
  const ridges = [0, 1, 2, 3, 4].map(i => {
    const x = 70 + i * 32, h = 50 * (1 - i * .16);
    return `<path d="M${x - 10},${128 - h} Q${x + 14},128 ${x - 4},${128 + h}" fill="none" stroke="#9a5c2c" stroke-width="5"/>`;
  }).join('');
  const face = bangs ? '<path d="M24,124 Q30,82 66,90 Q60,108 62,128 Q44,118 24,124 Z" fill="#1c1420"/><rect x="50" y="88" width="16" height="7" rx="3" fill="#ff8fd0"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">`
    + '<path d="M232,128 Q150,70 44,74 Q28,128 44,182 Q150,186 232,128 Z" fill="#d99a58" stroke="#5a3218" stroke-width="6" stroke-linejoin="round"/>'
    + ridges + '<ellipse cx="44" cy="128" rx="18" ry="50" fill="#4a2616"/><ellipse cx="40" cy="112" rx="6" ry="14" fill="#8a5236"/>' + face + '</svg>\n';
}
/** An old CRT TV, three-quarter view toward the right, grey static on the screen, feet on y 232. */
function tvSvg(): string {
  const bars = [0, 1, 2, 3, 4, 5].map(i => `<rect x="${78 + (i % 2) * 6}" y="${96 + i * 14}" width="${98 - (i % 3) * 12}" height="4" fill="#eef1f7" opacity=".7"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">`
    + '<polygon points="30,84 60,70 60,206 30,196" fill="#3f3949"/>'
    + '<rect x="60" y="70" width="160" height="140" rx="16" fill="#5b5466" stroke="#1d1a24" stroke-width="6"/>'
    + '<rect x="74" y="86" width="112" height="104" rx="14" fill="#9aa3b5"/>' + bars
    + '<circle cx="203" cy="110" r="6" fill="#2b2733"/><circle cx="203" cy="132" r="6" fill="#2b2733"/>'
    + '<rect x="78" y="210" width="18" height="22" fill="#2b2733"/><rect x="184" y="210" width="18" height="22" fill="#2b2733"/>'
    + '<line x1="140" y1="70" x2="112" y2="30" stroke="#2b2733" stroke-width="4"/><line x1="140" y1="70" x2="172" y2="34" stroke="#2b2733" stroke-width="4"/></svg>\n';
}
/** A little ghost crawling to the right on its belly, long black hair over its face, white dress, feet on y 240. */
function ghostSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">`
    + '<ellipse cx="104" cy="214" rx="78" ry="26" fill="#f6f4fa" stroke="#9a96ad" stroke-width="3"/>'
    + '<path d="M40,214 Q20,222 18,238 L64,236 Z" fill="#f6f4fa" stroke="#9a96ad" stroke-width="3"/>'
    + '<path d="M150,158 Q206,146 222,190 Q230,224 214,240 L150,240 Q136,200 150,158 Z" fill="#141018"/>'
    + '<path d="M196,226 L244,232 L244,240 L196,238 Z" fill="#eceaf4" stroke="#8f8aa6" stroke-width="2"/></svg>\n';
}

function commonPose(label: string): Pose | null {
  if (!label) return null;
  if (label in LOCO) return LOCO[label];
  const [name, phase] = label.split('-');
  const air = name.startsWith('air');
  const heavy = name.endsWith('Heavy') || name === 'heavy';
  const wind = heavy ? (air ? AIR_KICK_WIND : CHOP_WIND) : (air ? JUMP : PUNCH_WIND);
  const hit = heavy ? (air ? AIR_KICK_HIT : CHOP_HIT) : PUNCH_HIT;
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'rimi');
mkdirSync(dir, { recursive: true });
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
// Finished art is installed; keep the pose definitions without rasterizing over it.
const SHEETS: [string, string, number, number][] = [];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote rimi svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log(SHEETS.length ? 'wrote rimi sheets' : 'rimi sheets are finished art; nothing to rasterize');
}

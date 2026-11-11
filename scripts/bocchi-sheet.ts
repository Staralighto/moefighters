import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 后藤一里 (bocchi). Do not import write-sheets.ts.
   Special columns: U 完熟芒果 (crouched, both hands over her head / curled up hugging her knees — hidden under
   the box in play / half up out of the crouch), I 下北泽槌子蛇 (pitching forward onto her hands / flat on the
   floor — hidden behind the tsuchinoko in play / pushing herself up), O 给我点赞 (both fists drawn in at the
   chest / both arms straight out, thumbs up / easing back), L 吉他英雄 (guitar held close, head down / the
   solo, leaning back / the stage dive: flat, face down, arms out ahead, no guitar). The guitar is drawn into
   the first two L cells only. The box, the tsuchinoko, the 承认欲求怪兽 and the 崩坏 scribble are four separate
   256×256 pictures (stand-ins below), each standing on the same 12 px foot margin as a cell.
   Colour blocks only: hair, the pink tracksuit and shoes belong to the img2img prompt.
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
  /** Body build. */
  build?: 'slim' | 'tall';
  /** The stage dive: flat along the floor, face down, head toward the way she faces. */
  dive?: boolean;
  /** A guitar slung across the hips, body forward of the hip, neck rising forward. */
  guitar?: boolean;
  /** Kept for the shared figure(); unused here. */
  bass?: boolean;
  keys?: boolean;
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
const KICK_WIND: Pose = { lean: -.1, crouch: 4, armF: [.5, -1.6], armB: [.8, -1.4], legF: [-.5, .8], legB: [0, 0] };
const KICK_HIT: Pose = { lean: -.25, crouch: 0, look: .5, armF: [-.3, -1.2], armB: [1.0, -1.2], legF: [1.5, .2], legB: [-.1, 0] };
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
const GUITAR_BODY = '#2a2a30';
const GUITAR_NECK = '#c9a26b';
const COLOR = '#F5A9C0';

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
    // A Les Paul across the hips: single-cut body just ahead of the hip, neck rising forward past the chest.
    // Drawn with its real parts (two bouts and the cutaway, pickguard, two pickups, bridge, fretted neck,
    // headstock) because img2img copies whatever outline the block has.
    const gx = hip.x + 12, gy = hip.y - 2;
    const g = (x: number, y: number) => `${(gx + x).toFixed(1)},${(gy + y).toFixed(1)}`;
    const body = [[-24, -6], [-22, 10], [-12, 19], [2, 20], [14, 14], [19, 4], [16, -6], [22, -12], [18, -19], [8, -17], [4, -10], [-6, -16], [-18, -15]];
    const rot = `rotate(-32 ${gx.toFixed(1)} ${gy.toFixed(1)})`;
    parts.push(`<g transform="${rot}">`
      + `<rect x="${(gx + 14).toFixed(1)}" y="${(gy - 4.5).toFixed(1)}" width="62" height="9" fill="${OUTLINE}"/>`
      + `<rect x="${(gx + 14).toFixed(1)}" y="${(gy - 2.5).toFixed(1)}" width="60" height="5" fill="${GUITAR_NECK}"/>`
      + [26, 36, 46, 56, 66].map(x => `<rect x="${(gx + x).toFixed(1)}" y="${(gy - 2.5).toFixed(1)}" width="1.2" height="5" fill="${OUTLINE}"/>`).join('')
      + `<polygon points="${g(74, -6)} ${g(92, -8)} ${g(94, 4)} ${g(74, 6)}" fill="${GUITAR_BODY}" stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round"/>`
      + `<polygon points="${body.map(([x, y]) => g(x, y)).join(' ')}" fill="${GUITAR_BODY}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round"/>`
      + `<polygon points="${g(-4, 4)} ${g(10, 2)} ${g(12, 12)} ${g(0, 16)}" fill="#f1ead8"/>`
      + `<rect x="${(gx - 3).toFixed(1)}" y="${(gy - 6).toFixed(1)}" width="5" height="11" fill="#d8c27a"/>`
      + `<rect x="${(gx + 6).toFixed(1)}" y="${(gy - 6).toFixed(1)}" width="5" height="11" fill="#d8c27a"/>`
      + `<rect x="${(gx - 13).toFixed(1)}" y="${(gy - 5).toFixed(1)}" width="3" height="10" fill="#d8c27a"/>`
      + `</g>`);
    // Bounds, rotated the same −32°.
    const cs = Math.cos(-32 * Math.PI / 180), sn = Math.sin(-32 * Math.PI / 180);
    for (const [x, y] of [...body, [94, 4], [92, -8]]) marks.push({ x: gx + x * cs - y * sn, y: gy + x * sn + y * cs, r: 2 });
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
  if (pose.stick) stickIn(shoulder, pose.armF);
  const ox = pose.ox ?? 0;
  const origin = pose.dive
    ? `translate(${DIVE_X},${CELL - DIVE_Y}) rotate(90) scale(0.78)`
    : pose.lying
    ? `translate(${CELL - 16},${CELL / 2}) rotate(-90) scale(0.78)`
    : `translate(${CELL / 2 + ox},${CELL - FOOT + (pose.oy ?? 0)})`;
  return { svg: `<g transform="${origin}">${parts.join('')}</g>`, marks };
}

/** The dive's feet sit this far in from the left edge, and its spine this far above the bottom. */
const DIVE_X = 26, DIVE_Y = 30;

function cellPoint(pose: Pose, m: Mark): { x: number; y: number; r: number } {
  if (pose.dive) return { x: DIVE_X - m.y * 0.78, y: CELL - DIVE_Y + m.x * 0.78, r: m.r * 0.78 };
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


/* ---- U 完熟芒果 ---- */
const HEAD_DOWN: Pose = { lean: .5, crouch: 30, look: .5, neck: .5, armF: [2.3, 1.9], armB: [2.1, 2.0], legF: legAbs(1.25, .05, 30), legB: legAbs(-.15, -1.5, 30), ox: -14 };
const HUG_KNEES: Pose = { lean: .62, crouch: 32, look: .5, neck: .7, armF: [.95, .7], armB: [.85, .8], legF: legAbs(1.3, .05, 32), legB: legAbs(-.1, -1.55, 32), ox: -14 };
const HALF_UP: Pose = { lean: .18, crouch: 14, look: .4, armF: [.6, .5], armB: [.4, .5], legF: legAbs(.7, -.3, 14), legB: legAbs(-.2, -.75, 14) };
/* ---- I 下北泽槌子蛇 ---- */
const PITCH: Pose = { lean: .95, crouch: 26, look: .5, neck: .55, armF: [1.15, .1], armB: [1.0, .15], legF: legAbs(1.1, .05, 26), legB: legAbs(-.3, -1.2, 26), ox: -30 };
const FLAT: Pose = { lean: 0, crouch: 0, look: .3, armF: [.35, .4], armB: [.25, .5], legF: [.08, 0], legB: [-.08, 0], dive: true };
const PUSH_UP: Pose = { lean: .75, crouch: 28, look: .5, neck: .3, armF: [.45, -.05], armB: [.6, -.05], legF: legAbs(1.2, .05, 28), legB: legAbs(-.2, -1.4, 28), ox: -24 };
/* ---- O 给我点赞 ---- */
const FISTS_IN: Pose = { lean: -.06, crouch: 4, look: .3, armF: [1.0, 1.7], armB: [.9, 1.8], legF: [.3, 0], legB: [-.3, 0] };
const THUMBS: Pose = { lean: .12, crouch: 4, look: .5, armF: [1.57, 0], armB: [1.42, .05], legF: [.45, 0], legB: [-.4, 0] };
/* ---- L 吉他英雄 ---- */
const HOLD_CLOSE: Pose = { lean: .14, crouch: 4, look: .2, neck: .45, armF: [.95, .9], armB: [.45, 1.25], legF: [.25, 0], legB: [-.25, 0], guitar: true, ox: -20 };
const SOLO: Pose = { lean: -.22, crouch: 6, look: .3, neck: -.4, armF: [1.2, .45], armB: [.3, 1.4], legF: [.55, -.1], legB: [-.5, .15], guitar: true, ox: -20 };
const STAGE_DIVE: Pose = { lean: 0, crouch: 0, look: .3, neck: -.3, armF: [3.0, .06], armB: [2.85, .08], legF: [.1, 0], legB: [-.1, 0], dive: true };

const SPECIAL: Pose[][] = [
  [HEAD_DOWN, HUG_KNEES, HALF_UP],
  [PITCH, FLAT, PUSH_UP],
  [FISTS_IN, THUMBS, mix(THUMBS, IDLE, .55)],
  [HOLD_CLOSE, SOLO, STAGE_DIVE],
];

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

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'bocchi');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* Placeholders until finished art comes in. Drop a name from this list once its PNG is replaced
   (SOP step 8); --replace only on purpose. */

/* The four pictures her moves are thrown in. 256×256, transparent, each standing on the 12 px foot margin
   (y = 244). The tsuchinoko, the kaiju and the scribble face right; the box is never mirrored in play. */
const P = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${body}</svg>\n`;
/* 完熟芒果: a cardboard box, flaps shut, a mango printed on the front. The real one carries the lettering. */
const BOX_PNG = P(`<polygon points="38,112 218,112 218,244 38,244" fill="#d9b47a" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
<polygon points="38,112 62,84 242,84 218,112" fill="#c9a064" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
<polygon points="218,112 242,84 242,214 218,244" fill="#b98c52" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
<line x1="128" y1="112" x2="150" y2="84" stroke="${OUTLINE}" stroke-width="3"/>
<ellipse cx="128" cy="182" rx="40" ry="30" transform="rotate(-18 128 182)" fill="#f0a03c" stroke="${OUTLINE}" stroke-width="4"/>
<ellipse cx="118" cy="174" rx="14" ry="9" transform="rotate(-18 118 174)" fill="#f7c66a"/>
<rect x="58" y="126" width="140" height="10" fill="#b9853f"/><rect x="58" y="222" width="140" height="8" fill="#b9853f"/>`);
/* 下北泽槌子蛇: short, fat, flat on the floor, her two hair cubes on its head. */
const TSUCHI_PNG = P(`<polygon points="22,214 58,206 62,236 30,240" fill="#e88fae" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
<ellipse cx="124" cy="212" rx="86" ry="30" fill="#F5A9C0" stroke="${OUTLINE}" stroke-width="5"/>
<ellipse cx="204" cy="208" rx="34" ry="28" fill="#F5A9C0" stroke="${OUTLINE}" stroke-width="5"/>
<ellipse cx="124" cy="226" rx="70" ry="12" fill="#fbe3ea"/>
<circle cx="214" cy="200" r="6" fill="${OUTLINE}"/><line x1="222" y1="218" x2="236" y2="216" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>
<rect x="176" y="170" width="16" height="16" fill="#4aa3e8" stroke="${OUTLINE}" stroke-width="3"/><rect x="192" y="166" width="16" height="16" fill="#ffd84a" stroke="${OUTLINE}" stroke-width="3"/>`);
/* 承认欲求怪兽: a dinosaur suit with her face in its mouth, both thumbs up. */
const KAIJU_PNG = P(`<polygon points="40,236 78,150 96,236" fill="#6fae5c" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>
<ellipse cx="128" cy="176" rx="58" ry="68" fill="#7fbf6a" stroke="${OUTLINE}" stroke-width="5"/>
<ellipse cx="134" cy="190" rx="34" ry="44" fill="#e9f3c8"/>
<rect x="98" y="222" width="26" height="22" rx="8" fill="#7fbf6a" stroke="${OUTLINE}" stroke-width="5"/><rect x="140" y="222" width="26" height="22" rx="8" fill="#7fbf6a" stroke="${OUTLINE}" stroke-width="5"/>
<ellipse cx="140" cy="70" rx="56" ry="50" fill="#7fbf6a" stroke="${OUTLINE}" stroke-width="5"/>
<polygon points="92,36 104,14 116,34 128,10 140,32 152,12 162,36" fill="#6fae5c" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
<ellipse cx="150" cy="78" rx="34" ry="30" fill="#fde6dc" stroke="${OUTLINE}" stroke-width="4"/>
<path d="M118 62 Q150 30 184 66 L176 80 Q150 56 124 78 Z" fill="#F5A9C0" stroke="${OUTLINE}" stroke-width="3"/>
<circle cx="140" cy="84" r="5" fill="${OUTLINE}"/><circle cx="164" cy="84" r="5" fill="${OUTLINE}"/><path d="M142 98 Q152 106 162 98" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>
<line x1="80" y1="150" x2="50" y2="120" stroke="${OUTLINE}" stroke-width="22" stroke-linecap="round"/><line x1="80" y1="150" x2="50" y2="120" stroke="#7fbf6a" stroke-width="14" stroke-linecap="round"/>
<line x1="180" y1="150" x2="216" y2="124" stroke="${OUTLINE}" stroke-width="22" stroke-linecap="round"/><line x1="180" y1="150" x2="216" y2="124" stroke="#7fbf6a" stroke-width="14" stroke-linecap="round"/>
<rect x="38" y="92" width="14" height="26" rx="6" fill="#7fbf6a" stroke="${OUTLINE}" stroke-width="4"/><rect x="214" y="96" width="14" height="26" rx="6" fill="#7fbf6a" stroke="${OUTLINE}" stroke-width="4"/>`);
/* 崩坏: lying along the floor, head to the left. A flat pink shape and a loose black scribble over it; the game
   lifts the dark line off and adds the red / green / blue copies itself, so the picture has pink and black only. */
const CRUMBLE_PNG = P(`<path d="M14 232 L40 176 L78 150 L108 168 L150 176 L196 190 L240 214 L246 238 L200 244 L150 240 L96 244 L40 244 Z" fill="#F5A9C0"/>
<path d="M30 226 L44 186 L70 166 L98 176 L88 206 L60 222 Z M52 196 Q60 184 72 192 Q66 206 52 196 M96 180 L150 186 L198 200 L236 220 M104 214 L160 220 L210 232 M150 186 L138 226 M198 200 L186 236 M236 220 L244 236 L214 240 M40 244 L96 238 L150 236 M70 166 L60 150 L82 158" fill="none" stroke="#141018" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M36 214 L50 190 L74 176 M110 196 L160 204 L204 216 M118 230 L170 232" fill="none" stroke="#141018" stroke-width="2.5" stroke-linecap="round"/>`);

const SHEETS: [string, string, number, number][] = [
  ['common.png', common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
  ['special.png', special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
  ['box.png', BOX_PNG, 256, 256],
  ['tsuchinoko.png', TSUCHI_PNG, 256, 256],
  ['kaiju.png', KAIJU_PNG, 256, 256],
  ['crumble.png', CRUMBLE_PNG, 256, 256],
];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote bocchi svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log(SHEETS.length ? 'wrote bocchi sheets' : 'bocchi sheets are finished art; nothing to rasterize');
}

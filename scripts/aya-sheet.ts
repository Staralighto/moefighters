import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAllWritable, isPlaceholderPng, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt, SHEET_SCALE } from '../src/render/proportions.ts';

/* Colour-block Aya: common sheet and special sheet. Do not import write-sheets.ts.
   Special columns are U 劈瓦手刀 (chop raised overhead / slam down / settle),
   I 这次是真的在唱！ (mic in the far hand; sway back / sway forward / mid-sway —
   the channel cycles these cells), O 修车突进 (wrench in the near hand: cocked /
   lunge thrust / stand), L 丸山闪光 (hand to chest / wink open-palm raise /
   both hands circle overhead — the まんまるお山). */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean;
  /** Horizontal shift of the whole figure, so a cycle can travel inside the cell. */
  ox?: number;
  /** Head angle. Defaults to the spine, so a crawl can keep the chest low and the face up. */
  neck?: number;
  /** O column: a double-open-end wrench continues out of the near hand. */
  wrench?: boolean;
  /** I column: a handheld mic sits in the far hand. */
  mic?: boolean;
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

/* U 劈瓦手刀: the knife-hand coils high overhead, then slams straight down past the front knee. */
const CHOP_W: Pose = { lean: -.15, crouch: 3, look: .45, armF: [-2.9, .1], armB: [.3, -.4], legF: [.35, 0], legB: [-.3, 0] };
const CHOP_H: Pose = { lean: .45, crouch: 6, look: .5, armF: [1.5, .1], armB: [-.8, -.5], legF: [.55, -.15], legB: [-.5, .3] };
const CHOP_R: Pose = { lean: .15, crouch: 3, armF: [1.0, .3], armB: [.1, .2], legF: [.4, 0], legB: [-.3, 0] };
/* I 这次是真的在唱！: mic in the far hand at the mouth; the body sways back and forward in place. */
const SING_W: Pose = { lean: -.12, crouch: 3, look: .4, armF: [.5, -.4], armB: [-1.0, -1.5], legF: [.3, 0], legB: [-.3, 0], mic: true };
const SING_H: Pose = { lean: .15, crouch: 3, look: .55, armF: [1.2, -.2], armB: [-.8, -1.2], legF: [.35, 0], legB: [-.3, 0], mic: true };
const SING_R: Pose = { lean: 0, crouch: 3, look: .48, armF: [.2, .4], armB: [-.9, -1.35], legF: [.3, 0], legB: [-.3, 0], mic: true };
/* O 修车突进: the wrench cocks at the hip, lunges forward in a short slide, then stands. */
const WRENCH_W: Pose = { lean: -.1, crouch: 10, look: .4, armF: [-.7, -1.2], armB: [.6, -.5], legF: [.45, -.1], legB: [-.4, .15], wrench: true, ox: -2 };
const WRENCH_H: Pose = { lean: .5, crouch: 8, look: .55, armF: [1.5, 0], armB: [-1.0, -.6], legF: [1.1, -.2], legB: [-.9, .5], wrench: true, ox: 4 };
const WRENCH_R: Pose = { lean: .1, crouch: 4, armF: [1.0, .4], armB: [.2, .3], legF: [.35, 0], legB: [-.3, 0], wrench: true };
/* L 丸山闪光: hand to the chest with the head bowed, then the open-palm idol raise with the
   wink, and the hands close the まんまるお山 circle overhead. */
const FLASH_W: Pose = { lean: -.08, crouch: 4, look: -.1, armF: [-.6, -1.9], armB: [.3, .4], legF: [.3, 0], legB: [-.25, 0] };
const FLASH_H: Pose = { lean: -.06, crouch: 2, look: .55, armF: [-2.2, -.5], armB: [-.9, -.3], legF: [.45, -.1], legB: [-.35, .1] };
const FLASH_R: Pose = { lean: 0, crouch: 2, look: .1, armF: [-2.95, .25], armB: [-2.75, -.35], legF: [.3, 0], legB: [-.25, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}

/* SVG stand-in only. Re-running this script redraws every sheet it owns. */
const RUN: Pose[] = [
  { ox: -3, lean: .22, crouch: 8, look: .5, armF: [-1.05, -.3], armB: [.95, -.2], legF: [.41, -.2], legB: [-.92, 1] },
  { ox: 5, lean: .06, crouch: 1, look: .5, armF: [-.25, -1.15], armB: [.35, -1.05], legF: [.24, -.42], legB: [1.23, -1.69] },
  { ox: -3, lean: .22, crouch: 8, look: .5, armF: [.95, -.2], armB: [-1.05, -.3], legF: [-.92, 1], legB: [.41, -.2] },
  { ox: 5, lean: .06, crouch: 1, look: .5, armF: [.35, -1.05], armB: [-.25, -1.15], legF: [1.23, -1.69], legB: [.24, -.42] },
];

const LOCO: Record<string, Pose> = {
  idle: IDLE, run0: RUN[0], run1: RUN[1], run2: RUN[2], run3: RUN[3],
  jump: JUMP, block: BLOCK, dodge: DODGE, hurt: HURT, down: LYING, ko: LYING,
};

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#FF88BB';

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

function handOf(from: Pt, [a1, a2]: Limb, d: typeof DIMS.slim, s: number): Pt {
  const u = d.upperArm * s, f = d.foreArm * s;
  return { x: from.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f, y: from.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f };
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
  limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s, dark);
  limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s, dark);
  if (pose.mic) {
    // The mic sits in the far hand: a short handle along the forearm, then the ball.
    const h = handOf(shoulder, pose.armB, d, s);
    const dir = pose.armB[0] + pose.armB[1];
    const hx = h.x + Math.sin(dir) * 8, hy = h.y + Math.cos(dir) * 8;
    parts.push(stroke(h.x, h.y, hx, hy, 5, OUTLINE));
    parts.push(`<circle cx="${(hx + Math.sin(dir) * 6).toFixed(1)}" cy="${(hy + Math.cos(dir) * 6).toFixed(1)}" r="6" fill="${OUTLINE}"/>`);
    marks.push({ x: hx, y: hy, r: 8 });
  }
  const radii = torsoRadii(d.torsoW).map(n => n * s) as [number, number, number];
  const shell = torsoPoints(hip, shoulder, radii, 2);
  parts.push(poly(shell, OUTLINE));
  parts.push(poly(torsoPoints(hip, shoulder, radii, 0), COLOR));
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
  limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s, COLOR);
  limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s, COLOR);
  if (pose.wrench) {
    // The wrench continues out of the near hand along the forearm: a straight handle,
    // then the double jaw — one open-end at the tip, a shorter one mid-shaft.
    const h = handOf(shoulder, pose.armF, d, s);
    const dir = pose.armF[0] + pose.armF[1];
    const ux = Math.sin(dir), uy = Math.cos(dir);
    const L = d.foreArm * s * 1.35;
    const tip = { x: h.x + ux * L, y: h.y + uy * L };
    parts.push(stroke(h.x, h.y, tip.x, tip.y, 7, OUTLINE));
    const jaw = (at: number, len: number) => {
      const jx = h.x + ux * at, jy = h.y + uy * at;
      const px = -uy, py = ux;
      parts.push(stroke(jx + px * 5, jy + py * 5, jx + ux * len + px * 5, jy + uy * len + py * 5, 4, OUTLINE));
      parts.push(stroke(jx - px * 5, jy - py * 5, jx + ux * len - px * 5, jy + uy * len - py * 5, 4, OUTLINE));
      marks.push({ x: jx + ux * len, y: jy + uy * len, r: 6 });
    };
    jaw(L - 10, 12);
    jaw(L * .55, 9);
    marks.push({ x: tip.x, y: tip.y, r: 7 });
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
      const p = cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px`);
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
  const wind = heavy ? (air ? KICK_WIND : PUNCH_WIND) : (air ? JUMP : PUNCH_WIND);
  const hit = heavy ? (air ? KICK_HIT : PUNCH_HIT) : PUNCH_HIT;
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

const SPECIAL: Pose[][] = [
  [CHOP_W, CHOP_H, CHOP_R],
  [SING_W, SING_H, SING_R],
  [WRENCH_W, WRENCH_H, WRENCH_R],
  [FLASH_W, FLASH_H, FLASH_R],
];

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'aya');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* Only files that are still missing or placeholder-stamped get rastered; finished art is never touched.
   special.png is user art now (2026-10), so it stays off the raster list — the SPECIAL poses above
   are kept only as reference. */
void special;
const outs: [string, () => string, number, number][] = [
  [join(dir, 'common.png'), () => common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
];
const writable = outs.filter(([p]) => !existsSync(p) || isPlaceholderPng(readFileSync(p)));
assertAllWritable(writable.map(([p]) => p));
for (const [p, svg, w, h] of writable) rasterSheet(p, svg(), w, h);
console.log(`wrote ${writable.length} of ${outs.length} aya files`);

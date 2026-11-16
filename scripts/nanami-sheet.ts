import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 广町七深 (nanami). Do not import write-sheets.ts.
   Special columns: U 只是普通地路过 (crouched low, hands on the knees, peeking / a little hop out, both arms flung up,
   hands open — the scare / standing, hands together by the cheek), I 一发命中，很普通吧？ (both hands forward at waist
   height on a joystick / the same, the front hand pressing down on a button / a V sign by the face), O 我说了什么奇怪的话吗？
   (eyes closed, head tilted, hands together at the chest / leaning in a touch, a hand by the mouth / head tilted the
   other way, hands behind the back), L 不再假装普通 (the front hand up at her fringe, taking the hairpin off / a big
   brush swept forward and up / the brush lowered at her side). The brush is drawn into the L cells (a long stick with a
   bristle tip); the bush (bush.png) and the crane claw (claw.png, two cells: open | closed) are separate pictures.
   Empty-handed otherwise; the slim figure (157 cm).
   Colour blocks only: hair, clothes and shoes belong to the img2img prompt.
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
  /** Body build: 广町七深 is the slim figure (157 cm). */
  build?: 'slim' | 'tall';
  /** A guitar slung across the hips, body forward of the hip, neck rising forward. */
  guitar?: boolean;
  /** family.png props: a bass (a guitar with a long neck), a keyboard held in both hands. */
  bass?: boolean;
  keys?: boolean;
  /** 不再假装普通: a big paintbrush out of the front hand along the forearm. */
  brush?: boolean;
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
// 空手全垒打: coiled back with both hands at the back shoulder, then both arms swung straight through.
const KICK_WIND: Pose = { lean: -.15, crouch: 8, look: .45, armF: [-1.3, .7], armB: [-1.1, .9], legF: [.45, 0], legB: [-.4, 0] };
const KICK_HIT: Pose = { lean: .2, crouch: 6, look: .5, armF: [1.6, 0], armB: [1.45, .15], legF: [.6, 0], legB: [-.5, 0] };
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
const COLOR = '#EE7744';

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
  if (pose.stick) stickIn(shoulder, pose.armF);
  if (pose.brush) {
    // A long handle carried on out of the hand, a fat bristle tip at the end.
    const u = d.upperArm * s, f = d.foreArm * s;
    const [a1, a2] = pose.armF;
    const hx = shoulder.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = shoulder.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    const len = f * 1.7;
    const tx = hx + Math.sin(a1 + a2) * len, ty = hy + Math.cos(a1 + a2) * len;
    parts.push(stroke(hx, hy, tx, ty, 8, OUTLINE));
    parts.push(stroke(hx, hy, tx, ty, 4, GUITAR_NECK));
    const bx = tx + Math.sin(a1 + a2) * 12, by = ty + Math.cos(a1 + a2) * 12;
    parts.push(stroke(tx, ty, bx, by, 15, OUTLINE));
    parts.push(stroke(tx, ty, bx, by, 10, '#f4d9b8'));
    marks.push({ x: bx, y: by, r: 8 });
  }
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



/* ---- U 只是普通地路过 ---- */
const U_HIDE: Pose = { lean: .45, crouch: 34, look: .4, neck: .1, armF: [.9, .6], armB: [.6, .8], legF: legAbs(1.2, -1.6, 34), legB: legAbs(-.2, -1.5, 34) };
const U_BOO: Pose = { lean: -.05, crouch: 0, look: .4, armF: [2.8, .3], armB: [2.6, .45], legF: [.45, -.5], legB: [-.3, -.4], oy: -16 };
const U_DONE: Pose = { lean: 0, crouch: 0, look: .3, armF: [2.4, 2.2], armB: [2.2, 2.3], legF: [.2, 0], legB: [-.2, 0] };
/* ---- I 一发命中，很普通吧？ ---- */
const I_STICK: Pose = { lean: .12, crouch: 4, look: .4, armF: [1.2, .2], armB: [1.0, .35], legF: [.3, 0], legB: [-.3, 0] };
const I_PRESS: Pose = { lean: .18, crouch: 6, look: .3, armF: [1.0, .7], armB: [1.2, .1], legF: [.35, 0], legB: [-.3, 0] };
const I_DONE: Pose = { lean: 0, crouch: 0, look: .3, armF: [2.6, 2.0], armB: [.3, .3], legF: [.25, 0], legB: [-.25, 0] };
/* ---- O 我说了什么奇怪的话吗？ ---- */
const O_TILT: Pose = { lean: -.02, crouch: 0, look: .2, neck: -.25, armF: [1.0, 1.6], armB: [.9, 1.7], legF: [.2, 0], legB: [-.2, 0] };
const O_SAY: Pose = { lean: .12, crouch: 2, look: .45, neck: .3, armF: [1.6, 1.6], armB: [.3, .3], legF: [.3, 0], legB: [-.25, 0] };
const O_DONE: Pose = { lean: -.04, crouch: 0, look: .25, neck: .35, armF: [-.5, -.6], armB: [-.4, -.7], legF: [.2, 0], legB: [-.2, 0] };
/* ---- L 不再假装普通 ---- */
const L_PIN: Pose = { lean: -.05, crouch: 0, look: .3, armF: [2.9, .9], armB: [.3, .3], legF: [.25, 0], legB: [-.25, 0] };
const L_PAINT: Pose = { lean: .2, crouch: 8, look: .5, armF: [2.2, .2], armB: [.6, -.5], legF: [.6, 0], legB: [-.5, 0], brush: true };
const L_DONE: Pose = { lean: 0, crouch: 0, look: .3, armF: [.6, -.2], armB: [.3, .3], legF: [.25, 0], legB: [-.25, 0], brush: true };

const SPECIAL: Pose[][] = [
  [U_HIDE, U_BOO, U_DONE],
  [I_STICK, I_PRESS, I_DONE],
  [O_TILT, O_SAY, O_DONE],
  [L_PIN, L_PAINT, L_DONE],
];

/* ---- props: the bush (256 × 256) and the crane claw (512 × 256: open | closed), flat blocks on a transparent ground ---- */
function bushSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">`
    + `<circle cx="78" cy="170" r="70" fill="#3f7a32" stroke="${OUTLINE}" stroke-width="5"/>`
    + `<circle cx="180" cy="168" r="72" fill="#3f7a32" stroke="${OUTLINE}" stroke-width="5"/>`
    + `<circle cx="128" cy="112" r="80" fill="#5d9e45" stroke="${OUTLINE}" stroke-width="5"/>`
    + `<rect x="40" y="200" width="176" height="52" fill="#3f7a32"/>`
    + `<circle cx="104" cy="132" r="9" fill="${OUTLINE}"/><circle cx="152" cy="132" r="9" fill="${OUTLINE}"/>`
    + `<path d="M114 156 q7 8 14 0 q7 8 14 0" fill="none" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>`
    + `</svg>\n`;
}
function clawCell(x: number, spread: number): string {
  const prong = (sd: number) => `<path d="M${x + sd * 14} 80 Q${x + sd * 70 * spread} 140 ${x + sd * 40 * spread} 220" fill="none" stroke="${OUTLINE}" stroke-width="16" stroke-linecap="round"/>`
    + `<path d="M${x + sd * 14} 80 Q${x + sd * 70 * spread} 140 ${x + sd * 40 * spread} 220" fill="none" stroke="#b9b4c6" stroke-width="9" stroke-linecap="round"/>`;
  return `<rect x="${x - 34}" y="36" width="68" height="50" rx="8" fill="#8c879a" stroke="${OUTLINE}" stroke-width="5"/>`
    + `<rect x="${x - 6}" y="0" width="12" height="38" fill="#b9b4c6"/>`
    + prong(-1) + prong(1) + `<path d="M${x} 86 L${x} 214" stroke="${OUTLINE}" stroke-width="14" stroke-linecap="round"/><path d="M${x} 86 L${x} 214" stroke="#b9b4c6" stroke-width="7" stroke-linecap="round"/>`;
}
function clawSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256" viewBox="0 0 512 256">${clawCell(128, 1)}${clawCell(384, .35)}</svg>\n`;
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

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'nanami');
mkdirSync(dir, { recursive: true });
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* Finished art is installed in public/sprites/nanami. Keep this empty to protect it from rerasterizing placeholders. */
const SHEETS: [string, string, number, number][] = [];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote nanami svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log(SHEETS.length ? 'wrote nanami sheets' : 'nanami sheets are finished art; nothing to rasterize');
}

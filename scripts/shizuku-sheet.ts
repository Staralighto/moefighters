import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 四宫宁月 (shizuku). Do not import write-sheets.ts.
   Empty-handed except column I, where she holds the twin ice pop (棒棒冰).
   Special columns: U 锡纸加热实验 (a pinch of foil drawn back by the shoulder / the wrist flicked out forward /
   upright, hands folded), I 一人一半 (both hands at the chest snapping the ice pop / the throwing hand out
   forward, the other half at her mouth / upright, the half still in her mouth), O 社交派对的微笑 (upright, hands
   folded at the waist, head tilted — the party smile / the curtsy, knees bent, one foot crossed behind, hands
   holding the skirt out / upright, hands folded), L 世界如此广阔 (hands together at the chest / arms flung wide,
   looking up — 世界真是广阔啊 / upright, hands folded).
   Slim build; the shortest on the roster is a view.height matter, not a sheet one. The foil, the flying half,
   the microwave, the fridge and the washer are separate props (stand-ins written here, the user paints the
   real ones). Status looks and the accidents belong to fx (src/render/statusMarks.ts, shizukuFx.ts).
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
  /** A guitar slung across the hips, body forward of the hip, neck rising forward. */
  guitar?: boolean;
  /** family.png props: a bass (a guitar with a long neck), a keyboard held in both hands. */
  bass?: boolean;
  keys?: boolean;
  /** The ice pop: held across the front hand, or one half in her mouth. */
  pop?: 'hand' | 'mouth';
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
const GUITAR_BODY = '#3d6fb8';
const GUITAR_NECK = '#c9a26b';
const COLOR = '#9999FF';
const POP = '#f1eeff';

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
  const d = DIMS.slim;
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
  if (pose.pop === 'hand') {
    const u = d.upperArm * s, f = d.foreArm * s;
    const [a1, a2] = pose.armF;
    const hx = shoulder.x + Math.sin(a1) * u + Math.sin(a1 + a2) * f;
    const hy = shoulder.y + Math.cos(a1) * u + Math.cos(a1 + a2) * f;
    parts.push(`<rect x="${(hx - 22).toFixed(1)}" y="${(hy - 6).toFixed(1)}" width="44" height="12" rx="6" fill="${POP}" stroke="${OUTLINE}" stroke-width="3"/>`);
    marks.push({ x: hx - 24, y: hy, r: 7 }, { x: hx + 24, y: hy, r: 7 });
  } else if (pose.pop === 'mouth') {
    const mx = cx + r * .9, my = cy + r * .35;
    parts.push(`<rect x="${mx.toFixed(1)}" y="${(my - 5).toFixed(1)}" width="24" height="10" rx="5" fill="${POP}" stroke="${OUTLINE}" stroke-width="3"/>`);
    marks.push({ x: mx + 26, y: my, r: 6 });
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

/* ---- U 锡纸加热实验: the foil pinched back by the shoulder; the wrist flicked out; upright, hands folded ---- */
const FOIL_W: Pose = { lean: -.08, crouch: 4, look: .35, armF: [-.35, -2.1], armB: [.45, .9], legF: [.3, 0], legB: [-.3, 0] };
const FOIL_H: Pose = { lean: .14, crouch: 4, look: .55, armF: [1.85, -.35], armB: [-.4, -.4], legF: [.5, -.1], legB: [-.4, .1], ox: -10 };
const FOLDED: Pose = { lean: 0, crouch: 0, look: .3, armF: [.3, .95], armB: [.25, 1.05], legF: [.18, 0], legB: [-.18, 0] };
/* ---- I 一人一半: snapping the ice pop at the chest; one half thrown, the other at her mouth; holding it there ---- */
const POP_W: Pose = { lean: -.04, crouch: 2, look: .4, neck: .2, armF: [.75, 1.45], armB: [.55, 1.6], legF: [.25, 0], legB: [-.25, 0], pop: 'hand' };
const POP_H: Pose = { lean: .12, crouch: 4, look: .5, armF: [1.65, -.1], armB: [.7, 2.05], legF: [.5, -.1], legB: [-.4, .1], ox: -10, pop: 'mouth' };
const POP_R: Pose = { lean: 0, crouch: 0, look: .3, armF: [.3, .95], armB: [.75, 2.1], legF: [.18, 0], legB: [-.18, 0], pop: 'mouth' };
/* ---- O 社交派对的微笑: hands folded, head tilted; the curtsy; upright again ---- */
const SMILE_W: Pose = { lean: 0, crouch: 0, look: .3, neck: .35, armF: [.3, .95], armB: [.25, 1.05], legF: [.12, 0], legB: [-.12, 0] };
const SMILE_H: Pose = { lean: .12, crouch: 10, look: .45, neck: .4, armF: [.75, -.25], armB: [-.55, .2], legF: [.05, 0], legB: legAbs(-.1, -.6, 10) };
/* ---- L 世界如此广阔: hands together at the chest; arms flung wide, looking up; upright again ---- */
const WIDE_W: Pose = { lean: 0, crouch: 0, look: .3, neck: .05, armF: [.55, 2.05], armB: [.45, 2.15], legF: [.15, 0], legB: [-.15, 0] };
const WIDE_H: Pose = { lean: -.12, crouch: 2, look: .1, neck: -.25, armF: [2.35, .25], armB: [-2.3, -.25], legF: [.3, 0], legB: [-.3, 0] };

const SPECIAL: Pose[][] = [
  [FOIL_W, FOIL_H, FOLDED],
  [POP_W, POP_H, POP_R],
  [SMILE_W, SMILE_H, FOLDED],
  [WIDE_W, WIDE_H, FOLDED],
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

/* ---- props: stand-ins, 256 × 256, no background. The user paints the real ones and drops them from SHEETS. ---- */
const prop = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${body}</svg>\n`;
const FOIL = prop(`<polygon points="128,48 170,62 204,104 196,152 168,196 120,210 76,190 52,146 58,98 90,62" fill="#d7dbe3" stroke="${OUTLINE}" stroke-width="8"/><polyline points="92,110 130,140 168,100" fill="none" stroke="#8d93a3" stroke-width="7"/><polyline points="96,170 132,150 162,172" fill="none" stroke="#8d93a3" stroke-width="7"/>`);
const POPSICLE = prop(`<rect x="34" y="96" width="188" height="64" rx="32" fill="#f1eeff" stroke="${OUTLINE}" stroke-width="8"/><rect x="176" y="104" width="34" height="48" rx="10" fill="#c7c0ff"/><line x1="70" y1="112" x2="70" y2="144" stroke="#d9d3ff" stroke-width="8" stroke-linecap="round"/>`);
const MICROWAVE = prop(`<rect x="20" y="64" width="216" height="150" rx="16" fill="#f3f1ec" stroke="${OUTLINE}" stroke-width="8"/><rect x="38" y="84" width="130" height="110" rx="10" fill="#3a3d4a" stroke="${OUTLINE}" stroke-width="6"/><circle cx="202" cy="108" r="12" fill="${OUTLINE}"/><circle cx="202" cy="150" r="12" fill="${OUTLINE}"/><rect x="186" y="178" width="32" height="12" rx="4" fill="${OUTLINE}"/>`);
const FRIDGE = prop(`<rect x="58" y="10" width="140" height="240" rx="16" fill="#eef3f8" stroke="${OUTLINE}" stroke-width="8"/><line x1="58" y1="100" x2="198" y2="100" stroke="${OUTLINE}" stroke-width="7"/><line x1="176" y1="36" x2="176" y2="80" stroke="${OUTLINE}" stroke-width="9" stroke-linecap="round"/><line x1="176" y1="120" x2="176" y2="180" stroke="${OUTLINE}" stroke-width="9" stroke-linecap="round"/>`);
const WASHER = prop(`<rect x="34" y="20" width="188" height="226" rx="16" fill="#f3f1ec" stroke="${OUTLINE}" stroke-width="8"/><line x1="34" y1="66" x2="222" y2="66" stroke="${OUTLINE}" stroke-width="7"/><circle cx="70" cy="44" r="10" fill="${OUTLINE}"/><circle cx="128" cy="152" r="62" fill="#bfe3ff" stroke="${OUTLINE}" stroke-width="8"/><circle cx="104" cy="160" r="16" fill="#ffffff"/><circle cx="132" cy="140" r="20" fill="#ffffff"/><circle cx="154" cy="168" r="14" fill="#ffffff"/>`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'shizuku');
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* Placeholders until finished art comes in. Drop a name from this list once its PNG is replaced
   (SOP step 8); --replace only on purpose. */
const SHEETS: [string, string, number, number][] = [
  ['common.png', common, COMMON_COLS * CELL, COMMON_ROWS * CELL],
  ['special.png', special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL],
  ['foil.png', FOIL, CELL, CELL],
  ['popsicle.png', POPSICLE, CELL, CELL],
  ['microwave.png', MICROWAVE, CELL, CELL],
  ['fridge.png', FRIDGE, CELL, CELL],
  ['washer.png', WASHER, CELL, CELL],
];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote shizuku svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log('wrote shizuku sheets');
}

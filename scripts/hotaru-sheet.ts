import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block Hotaru. Do not import write-sheets.ts.
   Special columns are U 小馒头投喂 (reach back / toss), I 舞台装置 (both hands out / hold),
   O 重生之乐音 (arms in / flung wide), L 起死开战 (seated piano loop — the cells musicRow cycles).
   The stool is baked into the L column; the grand piano is a separate prop image, never in a cell. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; prone?: boolean;
  /** Horizontal shift of the whole figure, so a cycle can travel inside the cell. */
  ox?: number;
  /** Head angle. Defaults to the spine, so a crawl can keep the chest low and the face up. */
  neck?: number;
  /** L column only: a stool is drawn under the hips. */
  seat?: boolean;
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
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB), legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
  };
}

/* SVG stand-ins only. All four PNGs are finished art, so the script writes nothing until a
   target is deliberately re-added with --replace (see the end of the file). */

/* U 小馒头投喂: hand dips back for the bun, then swings up and out on the lob. */
const MANJU_W: Pose = { lean: -.12, crouch: 4, armF: [-.7, -1.5], armB: [.8, -1.4], legF: [.3, 0], legB: [-.3, 0], look: .1 };
const MANJU_H: Pose = { lean: .18, crouch: 2, armF: [1.9, -.8], armB: [-.4, -1.2], legF: [.5, 0], legB: [-.4, 0], look: .4 };
const MANJU_R: Pose = mix(MANJU_H, IDLE, .55);
/* I 舞台装置: both hands reach out flat, then hold the line while the device wakes. */
const APPA_W: Pose = { lean: -.08, crouch: 6, armF: [1.4, .25], armB: [1.25, .3], legF: [.3, 0], legB: [-.3, 0], look: .2 };
const APPA_H: Pose = { lean: .2, crouch: 2, armF: [1.55, .1], armB: [1.4, .15], legF: [.55, 0], legB: [-.45, 0], look: .3 };
const APPA_R: Pose = mix(APPA_H, IDLE, .55);
/* O 重生之乐音: arms curl in, then fling wide as the eight notes leave. */
const NOTE_W: Pose = { lean: -.05, crouch: 5, armF: [.65, -1.7], armB: [.55, -1.6], legF: [.3, 0], legB: [-.3, 0], look: -.1 };
const NOTE_H: Pose = { lean: -.22, crouch: 0, armF: [2.3, .35], armB: [-2.1, -.3], legF: [.4, 0], legB: [-.35, 0], look: .1 };
const NOTE_R: Pose = mix(NOTE_H, IDLE, .55);
/* L 起死开战: seated at the grand piano; the three cells alternate hands. */
const PIANO: Pose = { lean: .05, crouch: 16, armF: [1.2, -.45], armB: [1.05, -.4], legF: [1.05, -1.15], legB: [.9, -1.05], look: .25, seat: true };
const WAR_0: Pose = { ...PIANO, armF: [1.15, -.5], armB: [1.0, -.45] };
const WAR_1: Pose = { ...PIANO, armF: [1.3, -.3], armB: [.9, -.55] };
const WAR_2: Pose = { ...PIANO, armF: [1.05, -.6], armB: [1.15, -.35] };

const BG = '#1a1528';
const GRID = '#ff36c8';
const OUTLINE = '#151222';
const FOOT = 12;
const COLOR = '#99FF99';

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
  const bend = pose.prone ? 0 : pose.crouch * .03;
  const parts: string[] = [];
  const marks: Mark[] = [];
  // The L column sits on a stool that is baked into the sheet.
  if (pose.seat) {
    const wood = '#4a3a2a';
    parts.push(stroke(hip.x - 20, hip.y + 2, hip.x + 20, hip.y + 2, 7, OUTLINE));
    parts.push(stroke(hip.x - 18, hip.y + 2, hip.x - 18, 0, 5, wood));
    parts.push(stroke(hip.x + 18, hip.y + 2, hip.x + 18, 0, 5, wood));
  }
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
  const wind = heavy ? (air ? AIR_KICK_WIND : KICK_WIND) : (air ? JUMP : PUNCH_WIND);
  const hit = heavy ? (air ? AIR_KICK_HIT : KICK_HIT) : PUNCH_HIT;
  const rest = air ? JUMP : IDLE;
  return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
}

const SPECIAL: Pose[][] = [
  [MANJU_W, MANJU_H, MANJU_R],
  [APPA_W, APPA_H, APPA_R],
  [NOTE_W, NOTE_H, NOTE_R],
  [WAR_0, WAR_1, WAR_2],
];

/* Placeholder props, both standalone PNGs (never inside a cell):
   the cookie the U lobs and the grand piano the L plays behind. */
const cookie = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <ellipse cx="64" cy="66" rx="46" ry="40" fill="#151222"/>
  <ellipse cx="64" cy="64" rx="42" ry="36" fill="#f0c060"/>
  <ellipse cx="64" cy="58" rx="42" ry="32" fill="#ffe8b0"/>
  <circle cx="48" cy="56" r="4" fill="#a86818"/><circle cx="70" cy="48" r="3.4" fill="#a86818"/>
  <circle cx="82" cy="62" r="3.6" fill="#a86818"/><circle cx="58" cy="70" r="3.2" fill="#a86818"/>
  <circle cx="38" cy="66" r="3" fill="#a86818"/>
</svg>`;

const piano = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- Grand piano seen from the side, keyboard at the left (the player sits off-frame), tail to the right. -->
  <path d="M18 96 C18 60 60 40 130 40 L390 40 C460 40 494 66 494 100 C494 130 470 150 430 156 L60 168 C34 168 18 150 18 120 Z" fill="#241d2c" stroke="#151222" stroke-width="5"/>
  <rect x="26" y="88" width="200" height="30" rx="4" fill="#f3eefc"/>
  <rect x="26" y="88" width="200" height="10" fill="#d8d2e8"/>
  <g fill="#241d2c">
    <rect x="42" y="98" width="9" height="20"/><rect x="62" y="98" width="9" height="20"/><rect x="82" y="98" width="9" height="20"/>
    <rect x="102" y="98" width="9" height="20"/><rect x="118" y="98" width="9" height="20"/><rect x="138" y="98" width="9" height="20"/>
    <rect x="158" y="98" width="9" height="20"/><rect x="178" y="98" width="9" height="20"/><rect x="198" y="98" width="9" height="20"/>
  </g>
  <path d="M60 168 L54 236 L74 236 L82 172 Z" fill="#241d2c"/>
  <path d="M420 160 L438 232 L458 228 L440 156 Z" fill="#241d2c"/>
  <rect x="40" y="236" width="44" height="10" rx="4" fill="#a97d50"/>
  <rect x="428" y="228" width="44" height="10" rx="4" fill="#a97d50"/>
  <path d="M250 44 L250 168 L266 168 L266 44 Z" fill="#2c2438"/>
  <ellipse cx="70" cy="52" rx="60" ry="10" fill="#3a3048"/>
</svg>`;

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
/* All four PNGs are finished art now (their placeholder marker is gone), so none is in the
   raster list: a real PNG in the batch blocks the rest, per SOP. The builders stay for a future
   --replace re-run; re-add a target when deliberately redrawing that image. */
void common; void special; void cookie; void piano;
console.log('hotaru sheets are finished art; nothing to rasterize');

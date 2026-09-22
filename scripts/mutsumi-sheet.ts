import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block Mutsumi only. Do not import write-sheets.ts — that script redraws the whole cast.
   ponytail: one guitar polygon on the two columns that hold it. Ceiling = the 128 cell. */

type Limb = [number, number];
type Guitar = 'back' | 'sweep' | 'hold';
interface Pose {
  lean: number; crouch: number; armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; guitar?: Guitar;
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
const DASH_WIND: Pose = { lean: -.12, crouch: 6, armF: [.2, 1.4], armB: [.15, 1.6], legF: [-.2, 0], legB: [.4, -.15] };
const DASH: Pose = { lean: .45, crouch: 6, look: .6, armF: [-1.0, -.6], armB: [-1.3, -.5], legF: [1.1, -.3], legB: [-1.0, .6] };
const DASH_ON: Pose = { lean: .4, crouch: 4, look: .55, armF: [-1.15, -.45], armB: [-1.25, -.35], legF: [.95, -.15], legB: [-.85, .45] };
const CAST_WIND: Pose = { lean: -.1, crouch: 2, armF: [-.3, -2.4], armB: [-.5, -2.3], legF: [.3, 0], legB: [-.3, 0] };
const CAST_HIT: Pose = { lean: .1, crouch: 2, armF: [1.4, 0], armB: [1.2, .15], legF: [.5, 0], legB: [-.35, 0] };
const DODGE: Pose = { lean: -.35, crouch: 8, look: -.12, armF: [-.6, -.6], armB: [-.9, -.4], legF: [.9, -.4], legB: [-.7, .2] };
const AIR_KICK_WIND: Pose = { ...JUMP, armF: [1.8, -.6], legF: [-.3, -1.2] };
const AIR_KICK_HIT: Pose = { lean: -.15, crouch: 0, armF: [-.8, -.6], armB: [2.2, -.4], legF: [1.2, .5], legB: [.3, -.9] };

const SPIN_W: Pose = { lean: -.16, crouch: 2, guitar: 'back', armF: [-.55, -1.1], armB: [-.2, -.7], legF: [.22, 0], legB: [-.22, 0] };
const SPIN_H: Pose = { lean: .28, crouch: 3, look: .5, guitar: 'sweep', armF: [1.05, .15], armB: [.55, .45], legF: [.32, 0], legB: [-.24, 0] };
const SPIN_R: Pose = { lean: .04, crouch: 1, guitar: 'hold', armF: [.7, .9], armB: [.35, 1.3], legF: [.24, 0], legB: [-.2, 0] };
const PLAY_W: Pose = { lean: .02, crouch: 0, guitar: 'hold', armF: [.85, -1.15], armB: [.4, 1.15], legF: [.22, 0], legB: [-.18, 0] };
const PLAY_H: Pose = { lean: .02, crouch: 0, guitar: 'hold', armF: [.95, .55], armB: [.4, 1.2], legF: [.22, 0], legB: [-.18, 0] };
const PLAY_R: Pose = { lean: .02, crouch: 0, guitar: 'hold', armF: [.7, -.7], armB: [.38, 1.15], legF: [.22, 0], legB: [-.18, 0] };
const SUMMON_W: Pose = { lean: .04, crouch: 1, armF: [.7, -.35], armB: [.28, 1.55], legF: [.22, 0], legB: [-.2, 0] };
const SUMMON_H: Pose = { lean: .08, crouch: 1, look: .5, armF: [1.3, .08], armB: [.22, 1.6], legF: [.26, 0], legB: [-.18, 0] };
const SUMMON_R: Pose = { lean: .02, crouch: 0, armF: [.55, .85], armB: [.25, 1.7], legF: [.22, 0], legB: [-.2, 0] };
const REACH: Pose = { lean: .1, crouch: 3, armF: [1.15, -.15], armB: [1.0, .1], legF: [.4, -.05], legB: [-.2, 0] };
const HUG: Pose = { lean: .02, crouch: 2, armF: [1.25, .35], armB: [1.05, .5], legF: [.28, 0], legB: [-.16, 0] };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB), lying: b.lying,
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
const PINK = '#ff4f96';
const GUARD = '#f6f3ee';
const MAPLE = '#e6c48a';
const PICKUP = '#1a1a1e';
const SCALE = 0.58;
const FOOT = 12;
const COLOR = '#779977';

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

/* Neck points up. Hot-pink double-cut, white guard, two humbuckers — the reference guitar, small enough for a cell. */
const xy = (x: number, y: number): Pt => ({ x, y });
const GUITAR_BODY: Pt[] = [
  xy(-3.2, -13), xy(-8, -8), xy(-13.5, -12), xy(-15, -5), xy(-12.5, 2), xy(-14, 11),
  xy(-7, 16.5), xy(1, 18), xy(10, 15), xy(14.5, 7), xy(15, 0), xy(12.5, -6), xy(8, -11), xy(4.2, -7), xy(3.2, -13),
];
const GUITAR_GUARD: Pt[] = [
  xy(-1, -9), xy(3.2, -11), xy(9, -6), xy(11.5, 2), xy(10, 12), xy(3, 15.2), xy(-5, 13), xy(-9, 5), xy(-6, -2),
];
const GUITAR_ENDS: Pt[] = [...GUITAR_BODY, xy(-6.2, -47), xy(4.2, -47), xy(3.4, -38), xy(-3.4, -38)];

function guitarOf(shoulder: Pt, kind: Guitar): { svg: string; marks: Mark[] } {
  const place = kind === 'back'
    ? { x: shoulder.x - 12, y: shoulder.y + 8, rot: -32, s: 0.58 }
    : kind === 'sweep'
      ? { x: shoulder.x + 6, y: shoulder.y + 14, rot: 74, s: 0.56 }
      : { x: shoulder.x + 2, y: shoulder.y + 16, rot: 14, s: 0.7 };
  const rad = place.rot * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const map = (p: Pt): Pt => ({
    x: place.x + (p.x * cos - p.y * sin) * place.s,
    y: place.y + (p.x * sin + p.y * cos) * place.s,
  });
  const marks = GUITAR_ENDS.map(p => ({ ...map(p), r: 2 }));
  const frets = [ -18, -23, -28, -33 ].map(y =>
    stroke(-2.1, y, 2.1, y, 0.7, '#c4a36a'));
  const tuners = [-42.2, -44.4, -46.4].map(y =>
    `<circle cx="-6.4" cy="${y}" r="1.35" fill="${PICKUP}"/>`).join('');
  const svg = `<g transform="translate(${place.x.toFixed(1)},${place.y.toFixed(1)}) rotate(${place.rot}) scale(${place.s})">${[
    poly(GUITAR_BODY, PINK),
    `<polygon points="${GUITAR_BODY.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>`,
    poly(GUITAR_GUARD, GUARD),
    `<rect x="-1.2" y="-5.2" width="7.2" height="3.4" rx="0.6" fill="${PICKUP}"/>`,
    `<rect x="-1.2" y="2.4" width="7.2" height="3.4" rx="0.6" fill="${PICKUP}"/>`,
    `<rect x="-2" y="11.2" width="5.2" height="2.2" fill="${PICKUP}"/>`,
    `<circle cx="8.2" cy="10.4" r="1.5" fill="${GUARD}" stroke="${PICKUP}" stroke-width="0.6"/>`,
    `<rect x="-2.4" y="-38" width="4.8" height="26" fill="${MAPLE}" stroke="${OUTLINE}" stroke-width="1"/>`,
    ...frets,
    `<polygon points="-2.4,-38 -6.6,-41.5 -6.2,-47 3.6,-47 2.4,-38" fill="${MAPLE}" stroke="${OUTLINE}" stroke-width="1" stroke-linejoin="round"/>`,
    tuners,
  ].join('')}</g>`;
  return { svg, marks };
}

function figure(pose: Pose): { svg: string; marks: Mark[] } {
  const d = DIMS.slim;
  const s = SCALE;
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
  if (pose.guitar === 'back') {
    const g = guitarOf(shoulder, 'back');
    parts.push(g.svg);
    marks.push(...g.marks);
  }
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
  if (pose.guitar && pose.guitar !== 'back') {
    const g = guitarOf(shoulder, pose.guitar);
    parts.push(g.svg);
    marks.push(...g.marks);
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

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const clip = `c${row}${col}`;
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const pt = cellPoint(pose, m);
      const over = Math.max(-pt.x + pt.r, pt.x + pt.r - CELL, -pt.y + pt.r, pt.y + pt.r - CELL);
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
  [CAST_WIND, CAST_HIT, mix(CAST_HIT, IDLE, .55)],
  [SPIN_W, SPIN_H, SPIN_R],
  [PLAY_W, PLAY_H, PLAY_R],
  [SUMMON_W, SUMMON_H, SUMMON_R],
];

const MORTIS: Pose[][] = [
  [DASH_WIND, DASH, DASH_ON],
  [REACH, HUG, HUG],
  [PUNCH_WIND, PUNCH_HIT, mix(PUNCH_HIT, IDLE, .55)],
  [KICK_WIND, KICK_HIT, IDLE],
];

function propSvg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}"><rect width="${CELL}" height="${CELL}" fill="#00FF00"/>${body}</svg>\n`;
}

const cucumber = propSvg(`
  <path d="M24 62 C40 48 88 48 104 64 C88 78 40 80 24 66 Z" fill="#3f8c45" stroke="#151222" stroke-width="3"/>
  <circle cx="28" cy="64" r="6" fill="#2f6a34"/>
  <circle cx="100" cy="64" r="6" fill="#2f6a34"/>
`);

const note = propSvg(`
  <rect x="70" y="28" width="8" height="52" fill="#e7a0b8"/>
  <ellipse cx="58" cy="82" rx="22" ry="14" transform="rotate(-28 58 82)" fill="#e7a0b8"/>
  <path d="M78 28 Q108 40 80 62 Q96 42 78 36 Z" fill="#e7a0b8"/>
`);

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites');

function chromeBin(): string {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  const hit = candidates.find(p => existsSync(p));
  if (!hit) throw new Error('Chrome or Edge is required to rasterize sprite sheets');
  return hit;
}

function publish(name: string, svg: string, w: number, h: number): void {
  const file = join(dir, name);
  writeFileSync(file, svg);
  const png = file.replace(/\.svg$/, '.png');
  const profile = mkdtempSync(join(tmpdir(), 'sheet-'));
  const url = 'file:///' + file.replaceAll('\\', '/');
  const run = spawnSync(chromeBin(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, `--screenshot=${png}`, url,
  ], { stdio: 'pipe' });
  rmSync(profile, { recursive: true, force: true });
  if (run.status !== 0) throw new Error(`raster ${name} failed\n${run.stderr?.toString() ?? ''}`);
  const buf = readFileSync(png);
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  if (pw !== w || ph !== h) throw new Error(`${name} raster is ${pw}x${ph}, wanted ${w}x${h}`);
  rmSync(file);
}

const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => SPECIAL[c][r], (c, r) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r]);
const mortis = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => MORTIS[c][r], (c, r) => ['dash', 'grab', 'punch', 'kick'][c] + '-' + r);

publish('mutsumi-common.svg', common, COMMON_COLS * CELL, COMMON_ROWS * CELL);
publish('mutsumi-special.svg', special, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
publish('mutsumi-mortis.svg', mortis, SPECIAL_COLS * CELL, SPECIAL_ROWS * CELL);
publish('mutsumi-cucumber.svg', cucumber, CELL, CELL);
publish('mutsumi-note.svg', note, CELL, CELL);
console.log('wrote mutsumi sheets');

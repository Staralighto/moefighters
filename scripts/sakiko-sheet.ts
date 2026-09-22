import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, PHASES, SPECIAL_COLS, SPECIAL_KEYS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block Togawa Sakiko, unarmed. Same CELL grid as the other casts; a PNG replaces the file.
   U 忘却步, I 轮舞, O 月牙踢, L 忘却奏鸣.
   ponytail: one dressed figure, not a second renderer. Ceiling = this palette and CELL. */

type Limb = [number, number];
interface Pose {
  lean: number; crouch: number;
  armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  lying?: boolean; look?: number; flare?: number;
  hold?: 'keys'; notes?: boolean;
}

const SCALE = 0.56;
const FOOT = 12;
const BG = '#1a1528';
const GRID = '#ff36c8';
const OUT = '#16141e';

const HAIR = '#7799CC';
const HAIR_DEEP = '#5c78ad';
const HAIR_LITE = '#d5e2f7';
const RIBBON = '#1b1722';
const SKIN = '#f6cbbd';
const BLOUSE = '#9d2b42';
const BLOUSE_LITE = '#c45a70';
const CORSET = '#241f28';
const LACE = '#b58958';
const SKIRT = '#2a2630';
const SKIRT_LITE = '#4e4a56';
const CREAM = '#f3eadc';
const GOLD = '#e0c27a';
const GLOVE = '#1c1822';
const TIGHT = '#7a7682';
const BOOT = '#16141c';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function mix(a: Pose, b: Pose, k: number): Pose {
  const limb = (p: Limb, q: Limb): Limb => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  return {
    lean: lerp(a.lean, b.lean, k), crouch: lerp(a.crouch, b.crouch, k),
    armF: limb(a.armF, b.armF), armB: limb(a.armB, b.armB),
    legF: limb(a.legF, b.legF), legB: limb(a.legB, b.legB),
    look: lerp(a.look ?? .45, b.look ?? .45, k),
    flare: lerp(a.flare ?? 0, b.flare ?? 0, k),
    hold: k < .5 ? a.hold : b.hold,
    notes: k < .5 ? a.notes : b.notes,
    lying: b.lying,
  };
}

const IDLE: Pose = { lean: .02, crouch: 0, look: .48, armF: [.5, 1.55], armB: [.18, 1.4], legF: [.2, -.06], legB: [-.16, -.02] };
const WALK: Pose[] = [
  { lean: .035, crouch: 1, look: .48, flare: -2, armF: [-.35, 1.15], armB: [.55, 1.2], legF: [.36, -.2], legB: [-.3, .14] },
  { lean: .015, crouch: 0, look: .48, flare: 1, armF: [.2, 1.25], armB: [-.15, 1.15], legF: [.02, -.02], legB: [.26, -.5] },
  { lean: .035, crouch: 1, look: .48, flare: 2, armF: [.55, 1.2], armB: [-.35, 1.15], legF: [-.28, .12], legB: [.34, -.2] },
  { lean: .015, crouch: 0, look: .48, flare: -1, armF: [-.15, 1.2], armB: [.25, 1.2], legF: [.26, -.5], legB: [-.02, 0] },
];
const JUMP: Pose = { lean: .04, crouch: 0, look: .4, armF: [2.15, -.15], armB: [-.9, -.35], legF: [.65, -1.05], legB: [.12, -.65] };
const BLOCK: Pose = { lean: -.04, crouch: 3, look: .42, armF: [1.15, 1.4], armB: [.9, 1.5], legF: [.26, -.06], legB: [-.14, 0] };
const HURT: Pose = { lean: -.28, crouch: 3, look: -.12, flare: -3, armF: [-.45, -.35], armB: [-.85, -.25], legF: [.32, -.05], legB: [-.28, .08] };
const DODGE: Pose = { lean: -.3, crouch: 5, look: -.04, flare: -4, armF: [-.2, -.2], armB: [-.6, -.15], legF: [.68, -.32], legB: [-.5, .22] };
const LYING: Pose = { lean: -.25, crouch: 0, look: -.2, armF: [.3, .2], armB: [-.3, .1], legF: [.1, 0], legB: [-.08, 0], lying: true };

const LIGHT_W: Pose = { lean: -.1, crouch: 1, look: .35, armF: [-.45, -1.4], armB: [.55, -1.1], legF: [.22, -.06], legB: [-.24, .04] };
const LIGHT_H: Pose = { lean: .14, crouch: 1, look: .55, flare: 2, armF: [1.48, .06], armB: [-.15, -.8], legF: [.48, -.08], legB: [-.32, .1] };
const HEAVY_W: Pose = { lean: -.08, crouch: 3, look: .4, armF: [.4, -1.3], armB: [.7, -1.1], legF: [-.45, .75], legB: [.05, 0] };
const HEAVY_H: Pose = { lean: -.22, crouch: 0, look: .5, flare: 4, armF: [-.2, -1.0], armB: [.9, -1.0], legF: [1.42, .12], legB: [-.08, 0] };
const AIR_L_W: Pose = { ...JUMP, armF: [-.2, -1.2] };
const AIR_L_H: Pose = { ...JUMP, lean: .1, look: .55, armF: [1.4, .08] };
const AIR_H_W: Pose = { ...JUMP, legF: [-.2, -.8] };
const AIR_H_H: Pose = { lean: -.12, crouch: 0, look: .5, armF: [-.4, -.5], armB: [1.8, -.3], legF: [1.15, .35], legB: [.25, -.75] };

const THRUST_W: Pose = { lean: -.18, crouch: 5, look: .2, flare: -2, armF: [-.7, -.6], armB: [-.4, -.4], legF: [.28, -.15], legB: [-.45, .25] };
const THRUST_H: Pose = { lean: .22, crouch: 3, look: .55, flare: 3, armF: [1.4, .04], armB: [-.55, -.2], legF: [.9, -.1], legB: [-.7, .28] };
const SPIN_W: Pose = { lean: -.1, crouch: 2, look: .25, flare: -4, armF: [-.3, -1.3], armB: [.8, -1.0], legF: [.24, -.06], legB: [-.18, .04] };
const SPIN_H: Pose = { lean: .06, crouch: 1, look: .5, flare: 6, armF: [1.35, .1], armB: [-.4, -.4], legF: [.3, -.06], legB: [-.16, .02] };
const SPIN_R: Pose = { lean: .04, crouch: 2, look: .4, flare: -2, armF: [.35, .5], armB: [2.2, -.1], legF: [.55, -.15], legB: [-.12, 0] };
const MOON_W: Pose = { lean: .1, crouch: 8, look: .35, flare: 1, armF: [.4, -.8], armB: [-.3, -.5], legF: [.35, -.55], legB: [-.18, .08] };
const MOON_H: Pose = { lean: -.12, crouch: 0, look: .55, flare: 2, armF: [-.35, -.6], armB: [.5, -1.1], legF: [1.85, -.2], legB: [.04, 0] };
const KEYS_W: Pose = { lean: -.04, crouch: 0, look: .42, hold: 'keys', armF: [1.5, .04], armB: [1.22, .1], legF: [.16, -.04], legB: [-.12, 0] };
const KEYS_H: Pose = { lean: .03, crouch: 0, look: .5, hold: 'keys', notes: true, armF: [1.22, .06], armB: [1.02, .12], legF: [.16, -.04], legB: [-.12, 0] };
const KEYS_R: Pose = { lean: .02, crouch: 0, look: .46, hold: 'keys', notes: true, armF: [1.02, .18], armB: [.82, .16], legF: [.16, -.04], legB: [-.12, 0] };

const LOCO: Record<string, Pose> = {
  idle: IDLE,
  run0: WALK[0], run1: WALK[1], run2: WALK[2], run3: WALK[3],
  jump: JUMP, block: BLOCK, dodge: DODGE, hurt: HURT, down: LYING, ko: LYING,
};
const TRIPLES: Record<string, Pose[]> = {
  light: [LIGHT_W, LIGHT_H, mix(LIGHT_H, IDLE, .55)],
  heavy: [HEAVY_W, HEAVY_H, mix(HEAVY_H, IDLE, .55)],
  airLight: [AIR_L_W, AIR_L_H, mix(AIR_L_H, JUMP, .5)],
  airHeavy: [AIR_H_W, AIR_H_H, mix(AIR_H_H, JUMP, .5)],
  U: [THRUST_W, THRUST_H, mix(THRUST_H, IDLE, .5)],
  I: [SPIN_W, SPIN_H, SPIN_R],
  O: [MOON_W, MOON_H, mix(MOON_H, IDLE, .5)],
  L: [KEYS_W, KEYS_H, KEYS_R],
};

interface Mark { x: number; y: number; r: number }
interface Joint { mid: Pt; end: Pt; ang: number }

const n = (v: number) => v.toFixed(1);
const at = (p: Pt, ang: number, len: number): Pt => ({ x: p.x + Math.sin(ang) * len, y: p.y + Math.cos(ang) * len });

function poly(pts: Pt[], fill: string, stroke = OUT, sw = 1.6): string {
  return `<polygon points="${pts.map(p => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}
function line(a: Pt, b: Pt, w: number, color: string): string {
  return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${color}" stroke-width="${n(w)}" stroke-linecap="round"/>`;
}
function circ(p: Pt, r: number, fill: string, stroke?: string, sw = 1.5): string {
  const s = stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : '';
  return `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r)}" fill="${fill}"${s}/>`;
}
function bone(a: Pt, b: Pt, w: number, color: string): string {
  return line(a, b, w + 2.2, OUT) + line(a, b, w, color);
}

function figure(pose: Pose): { svg: string; marks: Mark[] } {
  const d = DIMS.slim;
  const s = SCALE;
  const legLen = (d.thigh + d.shin) * s;
  const hip: Pt = { x: 0, y: -legLen + pose.crouch * s };
  const torsoH = d.torsoH * s;
  const shoulder: Pt = { x: hip.x + Math.sin(pose.lean) * torsoH, y: hip.y - Math.cos(pose.lean) * torsoH };
  const bend = pose.crouch * .03;
  const limb = (from: Pt, [a1, a2]: Limb, l1: number, l2: number): Joint => {
    const mid = at(from, a1, l1);
    return { mid, end: at(mid, a1 + a2, l2), ang: a1 + a2 };
  };
  const legB = limb(hip, [pose.legB[0] + bend, pose.legB[1] - bend * 2], d.thigh * s, d.shin * s);
  const legF = limb(hip, [pose.legF[0] + bend, pose.legF[1] - bend * 2], d.thigh * s, d.shin * s);
  const armB = limb(shoulder, pose.armB, d.upperArm * s, d.foreArm * s);
  const armF = limb(shoulder, pose.armF, d.upperArm * s, d.foreArm * s);
  const r = d.headR * s;
  const head: Pt = {
    x: shoulder.x + Math.sin(pose.lean) * (r + NECK * s),
    y: shoulder.y - Math.cos(pose.lean) * (r + NECK * s),
  };
  const w = d.limb * s;
  const flare = pose.flare ?? 0;
  const lag = -flare;
  const parts: string[] = [];
  const marks: Mark[] = [];
  const watch = (p: Pt, rad: number) => marks.push({ x: p.x, y: p.y, r: rad });

  const ribbon = (root: Pt, end: Pt, c: Pt, color: string, width: number) => {
    const samp = (t: number): Pt => {
      const u = 1 - t;
      return { x: u * u * root.x + 2 * u * t * c.x + t * t * end.x, y: u * u * root.y + 2 * u * t * c.y + t * t * end.y };
    };
    const pts = [0, .34, .67, 1].map(samp);
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len * width * .5, py = dx / len * width * .5;
      left.push({ x: pts[i].x + px, y: pts[i].y + py });
      right.push({ x: pts[i].x - px, y: pts[i].y - py });
    }
    parts.push(poly([...left, ...right.reverse()], color));
    watch(end, width / 2 + 1.2);
    watch(c, width / 2 + 1.2);
  };
  const farRoot = { x: head.x - r * .7, y: head.y - r * .2 };
  const nearRoot = { x: head.x - r * .1, y: head.y + r * .15 };
  ribbon(farRoot, { x: hip.x - 24 + lag * .35, y: hip.y - 6 }, { x: head.x - 28 + lag, y: head.y + 16 }, HAIR_DEEP, 7);

  const bootOf = (j: Joint): Pt => {
    const flat = Math.max(0, Math.cos(j.ang));
    return { x: j.end.x + Math.sin(j.ang) * 3 + flat * 6.5, y: j.end.y + Math.cos(j.ang) * 3 };
  };
  const paintLeg = (j: Joint) => {
    const ankle = { x: j.mid.x + (j.end.x - j.mid.x) * .45, y: j.mid.y + (j.end.y - j.mid.y) * .45 };
    const toe = bootOf(j);
    parts.push(bone(hip, j.end, w, TIGHT));
    parts.push(bone(ankle, toe, w + 1.3, BOOT));
    parts.push(circ(toe, 2.5, GOLD, OUT, 1));
    watch(j.end, w / 2 + 1.6);
    watch(toe, 3.2);
  };
  const paintArm = (j: Joint, glove: boolean) => {
    const puff = { x: shoulder.x + (j.mid.x - shoulder.x) * .35, y: shoulder.y + (j.mid.y - shoulder.y) * .35 };
    parts.push(bone(shoulder, j.mid, w, SKIN));
    parts.push(circ(puff, 4.2, BLOUSE, OUT, 1.3));
    parts.push(circ({ x: puff.x + 1.2, y: puff.y - 1 }, 1.6, BLOUSE_LITE));
    parts.push(bone(j.mid, j.end, w * .92, glove ? GLOVE : SKIN));
    parts.push(circ(j.end, w * .85, glove ? GLOVE : SKIN, OUT, 1.1));
    watch(j.end, w + 1.4);
  };

  paintArm(armB, true);
  paintLeg(legB);

  const hem = 34;
  const back = -17 + flare * .3;
  const front = 12 + flare * .55;
  const skirtBack: Pt[] = [
    { x: hip.x - 6, y: hip.y + 2 },
    { x: hip.x + 8, y: hip.y + 1 },
    { x: hip.x + front, y: hip.y + hem - 11 },
    { x: hip.x + front * .2, y: hip.y + hem - 2 },
    { x: hip.x + back, y: hip.y + hem },
  ];
  parts.push(poly(skirtBack, SKIRT));
  skirtBack.forEach(p => watch(p, 1.5));

  const radii = torsoRadii(d.torsoW).map(v => v * s) as [number, number, number];
  const shell = torsoPoints(hip, shoulder, radii, 0);
  parts.push(poly(shell, CORSET, OUT, 2));
  const mid = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  parts.push(poly([shell[2], shell[3], mid(shell[3], shell[4], .55), mid(shell[2], shell[1], .55)], BLOUSE, OUT, 1.4));
  const neck = mid(shoulder, head, .45);
  parts.push(`<path d="M${n(neck.x)} ${n(neck.y)} l-3.4 -2.4 1.3 -1.1 2.2 1.6 z M${n(neck.x)} ${n(neck.y)} l-2.8 2.6 1.2 1 1.8 -2 z" fill="${RIBBON}"/>`);
  parts.push(circ({ x: neck.x + 1.4, y: neck.y - .4 }, 1.15, GOLD));
  const laceX = mid(hip, shoulder, .35).x + 1;
  const laceY = mid(hip, shoulder, .42).y;
  for (let i = 0; i < 3; i++) parts.push(line({ x: laceX, y: laceY + i * 3.4 }, { x: laceX, y: laceY + i * 3.4 + 2 }, 1.15, LACE));
  shell.forEach(p => watch(p, 1.6));

  paintLeg(legF);
  const cream: Pt[] = [
    { x: hip.x + 1, y: hip.y + hem - 16 },
    { x: hip.x + front - 1, y: hip.y + hem - 13 },
    { x: hip.x + front - 3, y: hip.y + hem - 5 },
    { x: hip.x + 2, y: hip.y + hem - 7 },
  ];
  parts.push(poly([
    { x: hip.x - 1, y: hip.y + 6 },
    { x: hip.x + 7, y: hip.y + 5 },
    { x: hip.x + front - 2, y: hip.y + hem - 14 },
    { x: hip.x + 1, y: hip.y + hem - 8 },
    { x: hip.x + back * .4, y: hip.y + hem - 7 },
  ], SKIRT_LITE, OUT, 1.2));
  parts.push(poly(cream, CREAM, OUT, 1.2));
  parts.push(line(cream[1], cream[2], 1.3, GOLD));
  cream.forEach(p => watch(p, 1.5));
  ribbon(nearRoot, { x: hip.x - 12 + lag * .15, y: hip.y + 16 }, { x: head.x - 8 + lag * .2, y: head.y + 30 }, HAIR, 6);

  if (pose.hold === 'keys') {
    const box = { x: shoulder.x + 12, y: shoulder.y + 1 };
    const kw = 30, kh = 11;
    parts.push(`<rect x="${n(box.x)}" y="${n(box.y)}" width="${kw}" height="${kh}" rx="2" fill="#2a261f" stroke="${OUT}" stroke-width="1.4"/>`);
    parts.push(`<rect x="${n(box.x + 1.4)}" y="${n(box.y + 1.4)}" width="${kw - 2.8}" height="${kh - 3}" fill="#f4efe6"/>`);
    for (let i = 0; i < 5; i++) {
      parts.push(`<rect x="${n(box.x + 3.2 + i * 5)}" y="${n(box.y + 1.6)}" width="2.1" height="5" fill="#1b1722"/>`);
    }
    watch({ x: box.x, y: box.y }, 1);
    watch({ x: box.x + kw, y: box.y + kh }, 1);
    if (pose.notes) {
      const glyphs = [{ x: box.x + kw - 2, y: box.y - 8 }, { x: box.x + kw + 4, y: box.y - 1 }, { x: box.x + kw - 6, y: box.y - 14 }];
      for (const g of glyphs) {
        parts.push(`<g fill="${HAIR}" stroke="${OUT}" stroke-width=".6"><rect x="${n(g.x)}" y="${n(g.y - 5)}" width="1.3" height="6"/><ellipse cx="${n(g.x - 1.2)}" cy="${n(g.y + 1.2)}" rx="2.3" ry="1.5" transform="rotate(-28 ${n(g.x)} ${n(g.y)})"/></g>`);
        watch(g, 4);
      }
    }
  }

  paintArm(armF, true);

  parts.push(circ(head, r + 1.6, OUT));
  parts.push(circ(head, r, SKIN));
  parts.push(circ({ x: head.x - r * .32, y: head.y - r * .22 }, r * .86, HAIR));
  parts.push(circ({ x: head.x - r * .05, y: head.y - r * .55 }, r * .28, HAIR_LITE));
  const bangs: Pt[] = [
    { x: head.x - r * .45, y: head.y - r * .7 },
    { x: head.x + r * .95, y: head.y - r * .25 },
    { x: head.x + r * .2, y: head.y - r * .02 },
    { x: head.x - r * .55, y: head.y - r * .2 },
  ];
  parts.push(poly(bangs, HAIR, HAIR, 0));
  const bow = (x: number, y: number) => `<path d="M${n(x)} ${n(y)} l-5.2 -3.8 1.8 -1.6 3.4 2.6 z M${n(x)} ${n(y)} l-4.4 4 1.7 1.3 2.8 -3 z" fill="${RIBBON}"/>`;
  parts.push(bow(farRoot.x + 1, farRoot.y));
  parts.push(bow(nearRoot.x - 1, nearRoot.y));
  watch(head, r + 2);
  const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .45));
  const eye = { x: head.x + r * gaze, y: head.y - r * .02 };
  const er = Math.max(1.8, r * .32);
  parts.push(circ(eye, er, '#f3d78a', OUT, 1));
  parts.push(circ({ x: eye.x + er * .12, y: eye.y + er * .08 }, er * .48, '#3a2c16'));
  parts.push(circ({ x: eye.x + er * .28, y: eye.y - er * .22 }, er * .22, '#fff8e8'));
  const mouth = { x: head.x + r * .15, y: head.y + r * .48 };
  parts.push(line(mouth, { x: mouth.x + r * .35, y: mouth.y + .4 }, 1, '#a56a68'));

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

function poseFor(label: string): Pose | null {
  if (!label) return null;
  if (label in LOCO) return LOCO[label];
  const [name, phase] = label.split('-');
  const i = PHASES.indexOf(phase as (typeof PHASES)[number]);
  return TRIPLES[name]?.[i] ?? null;
}

function cell(label: string, pose: Pose | null, col: number, row: number): string {
  const drawn = pose ? figure(pose) : null;
  if (drawn && pose) {
    for (const m of drawn.marks) {
      const p = cellPoint(pose, m);
      const over = Math.max(-p.x + p.r, p.x + p.r - CELL, -p.y + p.r, p.y + p.r - CELL);
      if (over > 1) throw new Error(`${label} leaves the cell by ${over.toFixed(1)}px`);
    }
  }
  const text = label ? `<text x="4" y="12" fill="${GRID}" font-size="9" font-family="monospace">${label}</text>` : '';
  const id = `c${row}x${col}`;
  return `<g transform="translate(${col * CELL},${row * CELL})"><clipPath id="${id}"><rect width="${CELL}" height="${CELL}"/></clipPath><g clip-path="url(#${id})"><rect width="${CELL}" height="${CELL}" fill="${BG}"/>${drawn?.svg ?? ''}</g><rect width="${CELL}" height="${CELL}" fill="none" stroke="${GRID}" stroke-width="1"/>${text}</g>`;
}

function sheet(cols: number, rows: number, labelAt: (c: number, r: number) => string): string {
  const w = cols * CELL, h = rows * CELL;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const label = labelAt(c, r);
    cells.push(cell(label, poseFor(label), c, r));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cells.join('')}</svg>\n`;
}

export function sakikoSheetSvg(): { common: string; special: string } {
  return {
    common: sheet(COMMON_COLS, COMMON_ROWS, (c, r) => COMMON_LABELS[r][c]),
    special: sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => `${SPECIAL_KEYS[c]}-${PHASES[r]}`),
  };
}

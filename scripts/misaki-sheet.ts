import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertAllWritable, rasterSheet } from './sprite-guard.ts';
import { CELL, COMMON_COLS, COMMON_LABELS, COMMON_ROWS, SPECIAL_COLS, SPECIAL_ROWS } from '../src/render/clips.ts';
import { DIMS, NECK, SHEET_SCALE, torsoPoints, torsoRadii, type Pt } from '../src/render/proportions.ts';

/* Colour-block 奥泽美咲 / 米歇尔 (misaki). Do not import write-sheets.ts.
   一人二役: two builds, four sheets and one prop.
   - 米歇尔 (the base form, the bear suit): michelle.png (the shared common poses in a bear's body: the sturdy
     build, a big round head with two round ears) and michelle-special.png — U 快乐飞行模式 (the crouch as the jets
     light / airborne, both arms cradling someone in a princess carry, legs trailing / the landing crouch), I 快乐火力模式
     (elbows pulled back, chest out / arms flung up and wide, leaning back as the missiles go / standing, hands
     down), O 请叫我本名 (both hands gripping the bear head; the other two cells are plain bear poses with the head
     still on — the pull and the change happen under the costume cloud, never on the sheet), L 米歇尔乐园 (one arm up calling / both arms up and wide
     / waving).
   - 美咲 (the alt form): common.png (the shared empty-hand human sheet, slim) and special.png — U 不要跳过我的问题
     (the backhand drawn / the lunge and the chop / easing up), I 会长猜拳 (the fist pumped at the waist / the punch
     straight out / back), O 黑衣人，拜托了 (a hand up snapping her fingers / arms crossed while she is changed / the
     same), L 明明我才是米歇尔！ (a paper bag for a head: the lunge, arms reaching / both hands gripping forward at head
     height / pulling up and back, arms high).
   - head.png: the bear head alone, 256×256 on a clear ground (thrown by O, torn off by 美咲's L).
   The missiles, fireworks, men in black and the parade are all fx (src/render/misakiFx.ts).
   Colour blocks only: hair, clothes, the suit's details and shoes belong to the img2img prompt.
   Previous header (template): Colour-block 须贺蕾叶 (raika).
   Special columns: U 我背你！ (the low dash / bent over, both hands reaching back to hold someone on her
   back / the run, still bent over with the hands behind), I 爱之拥抱 (arms flung wide in the lunge /
   arms locked round in front, leaning back / the squeeze, swaying), O 我开动了！ (palms together at the
   chest / a bowl at the mouth, chopsticks scooping / standing, cheeks full, the bowl held off to the
   side), L 上吧，My Family！ (one hand grabbing forward, shouting / the big strum on the guitar / the
   guitar settled, both hands up in a peace sign).
   family.png (same 4×3 grid as the special sheet, drawn at one shared scale; the game sizes each
   member to her real height): columns 千樱梨 / 蓬咲 / 宁月 / 心玖, empty-handed (the sticks, bass, keys
   and guitar live in their hit effects), rows coming in / the strike / standing. It is only ever drawn as single-colour silhouettes.
   162 cm, so the slim build. Common is the shared empty-hand human sheet. The rider, the hearts, the
   bowl, the beans and the family's glow all belong to fx (src/render/fx.ts).
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
  /** A guitar slung across the hips, body forward of the hip, neck rising forward. */
  guitar?: boolean;
  /** family.png props: a bass (a guitar with a long neck), a keyboard held in both hands. */
  bass?: boolean;
  keys?: boolean;
  /** 米歇尔: the bear build — a big round head with ears. */
  bear?: boolean;
  /** 请叫我本名: the bear body with 美咲's own small head on it. */
  bare?: boolean;
  /** 明明我才是米歇尔！: a paper bag for a head. */
  bag?: boolean;
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
const COLOR = '#006699';
const BEAR = '#DD33CC';
const BAG = '#b58a5a';
/** 米歇尔's head: this much bigger than a girl's, and its ears. */
const BEAR_HEAD = 1.75;

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
  const d = pose.bear ? DIMS.bulky : DIMS.slim;
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
  const human = d.headR * s;
  const r = pose.bear && !pose.bare ? human * BEAR_HEAD : human;
  const neck = pose.neck ?? pose.lean;
  const cx = shoulder.x + Math.sin(neck) * (r + NECK * s);
  const cy = shoulder.y - Math.cos(neck) * (r + NECK * s);
  if (pose.bag) {
    // A paper bag: a square a little bigger than the head, two eye holes.
    const b = r * 1.25;
    parts.push(`<rect x="${(cx - b - 2).toFixed(1)}" y="${(cy - b - 2).toFixed(1)}" width="${(b * 2 + 4).toFixed(1)}" height="${(b * 2 + 4).toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<rect x="${(cx - b).toFixed(1)}" y="${(cy - b).toFixed(1)}" width="${(b * 2).toFixed(1)}" height="${(b * 2).toFixed(1)}" fill="${BAG}"/>`);
    for (const k of [-.15, .45]) parts.push(`<circle cx="${(cx + b * k).toFixed(1)}" cy="${(cy - b * .1).toFixed(1)}" r="${(b * .16).toFixed(1)}" fill="${OUTLINE}"/>`);
    marks.push({ x: cx - b - 2, y: cy - b - 2, r: 0 }, { x: cx + b + 2, y: cy + b + 2, r: 0 }, { x: cx + b + 2, y: cy - b - 2, r: 0 }, { x: cx - b - 2, y: cy + b + 2, r: 0 });
  } else {
    if (pose.bear && !pose.bare) {
      // Two round ears, up and out from the crown.
      for (const k of [-1, 1]) {
        const a = neck + k * .62;
        const ex = cx + Math.sin(a) * r * 1.02, ey = cy - Math.cos(a) * r * 1.02, er = r * .42;
        parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(er + 2).toFixed(1)}" fill="${OUTLINE}"/>`);
        parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${light}"/>`);
        marks.push({ x: ex, y: ey, r: er + 2 });
      }
    }
    const headFill = pose.bare ? shade(COLOR, 1.35) : light;
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${headFill}"/>`);
    const gaze = Math.max(-.2, Math.min(.62, pose.look ?? .28 + pose.lean));
    const ex = cx + r * gaze, ey = cy - r * .08, er = Math.max(2.4, Math.min(r, human) * .42);
    parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${er.toFixed(1)}" fill="${OUTLINE}"/>`);
    parts.push(`<circle cx="${(ex + er * .35).toFixed(1)}" cy="${(ey - er * .2).toFixed(1)}" r="${(er * .38).toFixed(1)}" fill="${headFill}"/>`);
    marks.push({ x: cx, y: cy, r: r + 2 });
  }
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






/* ---- 米歇尔 (bear) special ---- */
const B = { bear: true } as const;
/* U 快乐飞行模式: the crouch as the jets light; airborne, cradling someone; the landing crouch */
const FLY_W: Pose = { ...B, lean: -.1, crouch: 12, look: .4, armF: [-.7, -.3], armB: [-.9, -.2], legF: legAbs(.9, -.1, 12), legB: legAbs(-.7, .45, 12) };
const FLY_H: Pose = { ...B, lean: .22, crouch: 0, look: .45, armF: [1.15, 1.0], armB: [1.0, 1.1], legF: [-.35, .55], legB: [-.7, .6], oy: -34, ox: -8 };
const FLY_R: Pose = { ...B, lean: .05, crouch: 14, look: .35, armF: [1.0, .3], armB: [.6, .4], legF: legAbs(.95, -.15, 14), legB: legAbs(-.75, .5, 14) };
/* I 快乐火力模式: elbows pulled back, chest out; arms flung up and wide, leaning back; standing, hands down */
const MIS_W: Pose = { ...B, lean: -.05, crouch: 6, look: .3, armF: [-.5, -1.3], armB: [-.6, -1.2], legF: [.35, 0], legB: [-.3, 0] };
const MIS_H: Pose = { ...B, lean: -.2, crouch: 4, look: .1, neck: -.3, armF: [2.4, .2], armB: [2.2, .3], legF: [.45, 0], legB: [-.45, 0] };
const MIS_R: Pose = { ...B, lean: 0, crouch: 0, look: .3, armF: [.5, .6], armB: [.4, .6], legF: [.3, 0], legB: [-.3, 0] };
/* O 请叫我本名: only the windup is ever seen — both hands on the (still worn) bear head. From the active frame the
   costume cloud covers her and the body is hidden (combat.ts: the pull and the change are never on the sheet),
   so the other two cells are plain bear poses that keep the head on: a little bow forward, then standing. */
const HEAD_W: Pose = { ...B, lean: -.05, crouch: 4, look: .3, armF: [2.75, .9], armB: [2.6, 1.0], legF: [.3, 0], legB: [-.3, 0] };
const HEAD_H: Pose = { ...B, lean: .2, crouch: 4, look: .45, armF: [.9, .5], armB: [.7, .6], legF: [.35, 0], legB: [-.3, 0] };
const HEAD_R: Pose = { ...B, lean: 0, crouch: 0, look: .3, armF: [.45, 1.9], armB: [.25, 2.0], legF: [.25, 0], legB: [-.25, 0] };
/* L 米歇尔乐园: one arm up calling; both arms up and wide; waving */
const LAND_W: Pose = { ...B, lean: -.05, crouch: 2, look: .1, neck: -.25, armF: [2.9, .1], armB: [.4, .4], legF: [.3, 0], legB: [-.3, 0] };
const LAND_H: Pose = { ...B, lean: -.08, crouch: 0, look: .25, armF: [2.5, .3], armB: [2.3, .4], legF: [.4, -.2], legB: [-.4, .2], oy: -10 };
const LAND_R: Pose = { ...B, lean: 0, crouch: 0, look: .3, armF: [2.3, .8], armB: [.4, .3], legF: [.3, 0], legB: [-.3, 0] };
const BEAR_SPECIAL: Pose[][] = [
  [FLY_W, FLY_H, FLY_R],
  [MIS_W, MIS_H, MIS_R],
  [HEAD_W, HEAD_H, HEAD_R],
  [LAND_W, LAND_H, LAND_R],
];

/* ---- 美咲 special ---- */
/* U 不要跳过我的问题: the backhand drawn; the lunge and the chop; easing up */
const TSU_W: Pose = { lean: -.1, crouch: 6, look: .4, armF: [-.4, -1.9], armB: [.9, -1.6], legF: [.35, 0], legB: [-.3, 0] };
const TSU_H: Pose = { lean: .35, crouch: 12, look: .55, armF: [1.75, -.2], armB: [-.6, -.4], legF: [.9, -.45], legB: [-.8, .3], ox: 10 };
const TSU_R: Pose = { lean: .1, crouch: 4, look: .4, armF: [1.2, .5], armB: [.3, .4], legF: [.45, -.1], legB: [-.4, .1] };
/* I 会长猜拳: the fist pumped at the waist; the punch straight out; back */
const JAN_W: Pose = { lean: -.05, crouch: 6, look: .35, armF: [-.3, -1.6], armB: [.5, 1.9], legF: [.35, 0], legB: [-.3, 0] };
const JAN_H: Pose = { lean: .15, crouch: 4, look: .58, armF: [1.57, 0], armB: [.5, -1.8], legF: [.5, 0], legB: [-.4, 0] };
const JAN_R: Pose = { lean: .05, crouch: 2, look: .4, armF: [1.0, .9], armB: [.4, 1.4], legF: [.35, 0], legB: [-.3, 0] };
/* O 黑衣人，拜托了: a hand up snapping; arms crossed while she is changed; the same */
const SUIT_W: Pose = { lean: -.03, crouch: 0, look: .15, armF: [2.8, .5], armB: [.4, .4], legF: [.25, 0], legB: [-.25, 0] };
const SUIT_H: Pose = { lean: 0, crouch: 0, look: .3, armF: [1.2, 1.6], armB: [1.1, 1.7], legF: [.2, 0], legB: [-.2, 0] };
/* L 明明我才是米歇尔！: bagged — the lunge, arms reaching; gripping forward at head height; pulling up and back */
const BAG_W: Pose = { bag: true, lean: .4, crouch: 10, armF: [1.7, -.1], armB: [1.5, 0], legF: [.9, -.5], legB: [-.8, .4] };
const BAG_H: Pose = { bag: true, lean: .1, crouch: 6, armF: [2.0, -.3], armB: [1.9, -.2], legF: [.5, -.1], legB: [-.45, .1] };
const BAG_R: Pose = { bag: true, lean: -.25, crouch: 8, armF: [2.9, -.2], armB: [2.8, -.1], legF: [.45, -.1], legB: [-.5, .2] };
const GIRL_SPECIAL: Pose[][] = [
  [TSU_W, TSU_H, TSU_R],
  [JAN_W, JAN_H, JAN_R],
  [SUIT_W, SUIT_H, SUIT_H],
  [BAG_W, BAG_H, BAG_R],
];

function commonPose(label: string, bear = false): Pose | null {
  if (!label) return null;
  const pick = (): Pose => {
    if (label in LOCO) return LOCO[label];
    const [name, phase] = label.split('-');
    const air = name.startsWith('air');
    const heavy = name.endsWith('Heavy') || name === 'heavy';
    const wind = heavy ? (air ? AIR_KICK_WIND : KICK_WIND) : (air ? JUMP : PUNCH_WIND);
    const hit = heavy ? (air ? AIR_KICK_HIT : KICK_HIT) : PUNCH_HIT;
    const rest = air ? JUMP : IDLE;
    return phase === 'windup' ? wind : phase === 'active' ? hit : mix(hit, rest, .55);
  };
  const p = pick();
  return bear ? { ...p, bear: true } : p;
}

/** The bear head alone on a clear ground, centred in its 256 cell. */
function headProp(): string {
  const c = CELL / 2, r = 72;
  const light = shade(BEAR, 1.35);
  const ear = (k: number) => {
    const ex = c + k * r * .74, ey = c - r * .74;
    return `<circle cx="${ex}" cy="${ey}" r="${r * .38 + 3}" fill="${OUTLINE}"/><circle cx="${ex}" cy="${ey}" r="${r * .38}" fill="${light}"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${CELL}" viewBox="0 0 ${CELL} ${CELL}">${ear(-1)}${ear(1)}`
    + `<circle cx="${c}" cy="${c + 8}" r="${r + 3}" fill="${OUTLINE}"/><circle cx="${c}" cy="${c + 8}" r="${r}" fill="${light}"/>`
    + `<ellipse cx="${c}" cy="${c + 36}" rx="${r * .45}" ry="${r * .32}" fill="#ffe3f2"/>`
    + `<circle cx="${c - 26}" cy="${c}" r="8" fill="${OUTLINE}"/><circle cx="${c + 26}" cy="${c}" r="8" fill="${OUTLINE}"/>`
    + `<circle cx="${c}" cy="${c + 28}" r="7" fill="${OUTLINE}"/></svg>\n`;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'misaki');
const label = (c: number, r: number) => 'UIOL'[c] + '-' + ['wind', 'hit', 'back'][r];
const michelle = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c], true), (c, r) => COMMON_LABELS[r][c], BEAR);
const michelleSpecial = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => BEAR_SPECIAL[c][r], label, BEAR);
const common = sheet(COMMON_COLS, COMMON_ROWS, (c, r) => commonPose(COMMON_LABELS[r][c]), (c, r) => COMMON_LABELS[r][c]);
const special = sheet(SPECIAL_COLS, SPECIAL_ROWS, (c, r) => GIRL_SPECIAL[c][r], label);
const head = headProp();
/* Finished art. The poses above stay as the record; drop a sheet back into SHEETS only to redraw a placeholder. */
void michelle; void michelleSpecial; void common; void special; void head;
const SHEETS: [string, string, number, number][] = [];
const svgAt = process.argv.indexOf('--svg');
if (svgAt >= 0) {
  const out = process.argv[svgAt + 1];
  mkdirSync(out, { recursive: true });
  for (const [name, svg] of SHEETS) writeFileSync(join(out, name.replace('.png', '.svg')), svg);
  console.log('wrote misaki svgs to ' + out);
} else {
  assertAllWritable(SHEETS.map(([name]) => join(dir, name)));
  for (const [name, svg, w, h] of SHEETS) rasterSheet(join(dir, name), svg, w, h);
  console.log(SHEETS.length ? 'wrote misaki sheets' : 'misaki sheets are finished art; nothing to rasterize');
}

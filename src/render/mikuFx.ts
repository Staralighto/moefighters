import type { Effect } from '../game/game.ts';
import { H, W, clamp } from '../game/constants.ts';
import { PLAY_BYE, PLAY_CURTAIN, PLAY_DRAW, PLAY_FIGURE_H, PLAY_FIGURES, PLAY_HOUSE, PLAY_SLASHES } from './clips.ts';

/* 马桥心玖 — 表 / 里. The surface is the polite smile: pastel, soft, sparkling, a shoujo-manga glow.
   Under it is ink: cold, flat, sharp. Her moves are plain on purpose, so the fx carry the turn of the
   face — the glow is cut in two, a cold glint crosses her eye, an official seal comes down, the manga
   gloom lines drop when she is caught out. Her recurring device is the thought bubble (the 277 bracketed
   lines of inner monologue in the band story). The super turns the stage grey and draws a life-size
   crayon playhouse round them, then takes it apart; the crayon is the only colour left on screen.
   Restraint: one subject per beat, flat shapes, nothing finer than a 2 px line, fast decay.
   Pure drawing: positions and timing come from the effect, wobble is a hash of the index. */

/** Painted under every body: the glow behind her head, the gloom panel behind her, the playhouse. */
export const MIKU_BACK: readonly string[] = ['puff-smile', 'puff-split', 'caught-shock', 'play-lights', 'playhouse', 'playhouse-mend'];
/** Screen space, behind every body: the stage goes grey while the playhouse stands. */
export const MIKU_SCREEN_BACK: readonly string[] = ['play-cold'];

const TAU = Math.PI * 2;
const INK = '#141b30';
const PAPER = '#fffaf0';
const SCRAP_COLORS = ['#d9583e', '#a97a4b', PAPER, PAPER, '#FF7700', '#f2b632', '#5aa0d8'] as const;
const MIKU = '#22CCFF';
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

const frac = (x: number) => x - Math.floor(x);
/** ponytail: every call site passes small integers, so a few hundred entries cover the whole module.
 *  The sin noise never changes for a given pair; looking it up beats recomputing it on every point. */
const hashed = new Map<number, number>();
function hash(i: number, k = 0): number {
  const key = i * 131 + k;
  const hit = hashed.get(key);
  if (hit !== undefined) return hit;
  const v = frac(Math.sin(i * 12.9898 + k * 78.233 + 1.7) * 43758.5453);
  hashed.set(key, v);
  return v;
}
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const easeIn = (t: number) => clamp(t, 0, 1) ** 2;
const backOut = (k: number) => { const c = 1.9; const u = clamp(k, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);

/** Gradients are built once per context, at the origin or at unit size, and placed with the current
 *  transform; fades ride on globalAlpha. Same rule as sakikoFx: a frame allocates no gradients. */
const paints = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
function paint(ctx: CanvasRenderingContext2D, key: string, make: () => CanvasGradient): CanvasGradient {
  let m = paints.get(ctx);
  if (!m) paints.set(ctx, m = new Map());
  let g = m.get(key);
  if (!g) m.set(key, g = make());
  return g;
}
function stops(g: CanvasGradient, list: readonly (readonly [number, string])[]): CanvasGradient {
  for (const [o, c] of list) g.addColorStop(o, c);
  return g;
}
/** Lite drops the soft wax halo under each crayon stroke (the second, wide pass). Sticky for the draw. */
let wax = true;

/** The bubbles, by Effect.n. 0–2 are thoughts (round, trailing circles); 3 is said out loud. */
const BUBBLES = ['（……真是够了）', '（……被看穿了）', '（……得调整状态了）', '再见'] as const;

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, thin = .18): void {
  const w = r * thin;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + w, y - w, x + r, y);
  ctx.quadraticCurveTo(x + w, y + w, x, y + r);
  ctx.quadraticCurveTo(x - w, y + w, x - r, y);
  ctx.quadraticCurveTo(x - w, y - w, x, y - r);
  ctx.fill();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .6, y - s * 1.2, x, y - s * .35);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.2, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fill();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- 过家家到此为止: the crayon playhouse ---------- */

type Pts = readonly (readonly [number, number])[];
/** ponytail: one scratch for segment lengths. crayon does not call itself, so a second stroke of the
 *  same path (the wax halo) reuses it instead of walking the points again. */
const seg: number[] = [];
/** A crayon stroke drawn up to `k` of its length: a soft waxy halo under a slightly wobbly core.
 *  The halo is the same path as the core, so it is stroked twice and built once. */
function crayon(ctx: CanvasRenderingContext2D, pts: Pts, color: string, seed: number, k = 1, width = 4): void {
  const n = pts.length;
  if (k <= 0 || n < 2) return;
  seg.length = n - 1;
  let total = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg[i - 1] = d;
    total += d;
  }
  const want = total * clamp(k, 0, 1);
  ctx.beginPath();
  let left = want;
  for (let i = 0; i < n; i++) {
    const wx = (hash(seed, i) - .5) * 1.8, wy = (hash(seed, i + 13) - .5) * 1.8;
    if (i === 0) { ctx.moveTo(pts[0][0] + wx, pts[0][1] + wy); continue; }
    const d = seg[i - 1];
    if (left >= d) { ctx.lineTo(pts[i][0] + wx, pts[i][1] + wy); left -= d; continue; }
    const u = d > 0 ? left / d : 0;
    ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u);
    break;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  const a = ctx.globalAlpha;
  if (wax) {
    ctx.globalAlpha = a * .3;
    ctx.lineWidth = width * 2;
    ctx.stroke();
    ctx.globalAlpha = a;
  }
  ctx.lineWidth = width;
  ctx.stroke();
}
function circlePts(cx: number, cy: number, r: number, n = 14): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i * TAU / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

const { w: HW, wall: WALL, roof: ROOF } = PLAY_HOUSE;
const sideOf = (side: number): 1 | -1 => side < 0 ? -1 : 1;
/** Strokes that never move, built once. The window, chimney and sun flip with the side she leaves by. */
const WALLS: Pts = [[-HW, 0], [-HW, -WALL], [HW, -WALL], [HW, 0]];
const ROOF_LINE: Pts = [[-HW - 16, -WALL + 4], [0, -ROOF], [HW + 16, -WALL + 4]];
const GROUND: Pts = [[-HW - 30, 0], [HW + 30, 0]];
const DOOR: Pts = [[-26, 0], [-26, -84], [26, -84], [26, 0]];
const KNOB: Pts = circlePts(16, -40, 3, 6);
const CURTAIN_LINE: Pts = [[-44, 40], [-14, 44], [16, 40], [46, 44]];
const CURTAIN_DOT_L: Pts = circlePts(-58, -10, 6, 8);
const CURTAIN_DOT_R: Pts = circlePts(60, 14, 5, 8);
/** The half of the house that drifts back: wall, roof and door, one set per facing. */
const MEND: Record<1 | -1, readonly [Pts, Pts, Pts]> = {
  1: [[[0, -WALL], [HW, -WALL], [HW, 0]], [[0, -ROOF], [HW + 16, -WALL + 4]], [[0, -84], [26, -84], [26, 0]]],
  [-1]: [[[0, -WALL], [-HW, -WALL], [-HW, 0]], [[0, -ROOF], [-(HW + 16), -WALL + 4]], [[0, -84], [-26, -84], [-26, 0]]],
};
function windowOf(wx: number): readonly [Pts, Pts] {
  return [
    [[wx - 16, -122], [wx + 16, -122], [wx + 16, -96], [wx - 16, -96], [wx - 16, -122]],
    [[wx, -122], [wx, -96]],
  ];
}
function chimneyOf(cx: number): Pts {
  return [[cx - 9, -ROOF + 48], [cx - 9, -ROOF + 20], [cx + 9, -ROOF + 20], [cx + 9, -ROOF + 62]];
}
const WINDOW: Record<1 | -1, readonly [Pts, Pts]> = { 1: windowOf(-72), [-1]: windowOf(72) };
const CHIMNEY: Record<1 | -1, Pts> = { 1: chimneyOf(54), [-1]: chimneyOf(-54) };
const SUN: Record<1 | -1, Pts> = { 1: circlePts(-(HW + 34), -ROOF + 6, 13), [-1]: circlePts(HW + 34, -ROOF + 6, 13) };
function sunRays(side: 1 | -1): Pts[] {
  const sx = -side * (HW + 34), sy = -ROOF + 6;
  const rays: Pts[] = [];
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + .2;
    rays.push([[sx + Math.cos(a) * 19, sy + Math.sin(a) * 19], [sx + Math.cos(a) * 27, sy + Math.sin(a) * 27]]);
  }
  return rays;
}
const RAYS: Record<1 | -1, Pts[]> = { 1: sunRays(1), [-1]: sunRays(-1) };
/** The curl of smoke is the only house stroke that moves; the points are rewritten in place. */
const smokePts: [number, number][] = Array.from({ length: 11 }, () => [0, 0]);
/** When each part of the house draws itself in, as fractions of PLAY_DRAW after the cut. */
const DRAW_HOUSE: readonly [number, number] = [0, .45];
const DRAW_DOOR: readonly [number, number] = [.35, .6];
const DRAW_EXTRA: readonly [number, number] = [.5, .75];
const DRAW_FIGURE0 = .45;
const DRAW_FIGURE_STEP = .1;
const DRAW_FIGURE_LEN = .3;
function tearAt(i: number): number {
  return i < PLAY_SLASHES.length ? PLAY_SLASHES[i] : PLAY_BYE;
}
/** The house itself: paper-pale walls, a crooked roof, a door behind them, a window, a chimney with a curl
 *  of smoke and a sun in the far corner. `t` is seconds since the cut. `side` is the side she left by. */
function drawHouse(ctx: CanvasRenderingContext2D, t: number, side: number): void {
  const k = (r: readonly [number, number]) => span(t, r[0] * PLAY_DRAW, r[1] * PLAY_DRAW);
  const kh = k(DRAW_HOUSE);
  // A pale wash of paper behind the lines, so the house reads as a thing and not a doodle on the air.
  ctx.save();
  ctx.globalAlpha *= .2 * kh;
  ctx.fillStyle = PAPER;
  ctx.beginPath(); ctx.moveTo(-HW, 0); ctx.lineTo(-HW, -WALL); ctx.lineTo(0, -ROOF); ctx.lineTo(HW, -WALL); ctx.lineTo(HW, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  crayon(ctx, WALLS, '#a97a4b', 1, kh, 4.5);
  crayon(ctx, ROOF_LINE, '#d9583e', 2, span(kh, .25, 1), 5);
  crayon(ctx, GROUND, '#7aa34a', 3, kh, 3.5);
  const kd = k(DRAW_DOOR);
  crayon(ctx, DOOR, '#a97a4b', 4, kd, 3.5);
  crayon(ctx, KNOB, '#a97a4b', 5, kd, 3);
  const ke = k(DRAW_EXTRA);
  const face = sideOf(side);
  const [pane, mullion] = WINDOW[face];
  crayon(ctx, pane, '#5aa0d8', 6, ke, 3);
  crayon(ctx, mullion, '#5aa0d8', 7, ke, 2.5);
  const cx = side * 54;
  crayon(ctx, CHIMNEY[face], '#d9583e', 8, ke, 3.5);
  // A curl of smoke that keeps curling while the house stands.
  if (ke > .5) {
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      smokePts[i][0] = cx + Math.sin(u * 7 + t * 4) * 6 + u * 10 * side;
      smokePts[i][1] = -ROOF + 16 - u * 44;
    }
    ctx.save(); ctx.globalAlpha *= .7; crayon(ctx, smokePts, '#9aa3b5', 9, (ke - .5) * 2, 2.5); ctx.restore();
  }
  // The sun, the way every child draws one, in the corner away from her.
  crayon(ctx, SUN[face], '#f2b632', 10, ke, 3.5);
  const rays = RAYS[face], kr = span(ke, .3, 1);
  for (let i = 0; i < rays.length; i++) crayon(ctx, rays[i], '#f2b632', 20 + i, kr, 3);
}
/** How far each figure reaches for the hands on its left and its right. The lineup never changes,
 *  so both facings are worked out once — the inner two reach across the person standing in the middle. */
const REACH: Record<1 | -1, readonly (readonly [number, number])[]> = (() => {
  const build = (side: 1 | -1) => PLAY_FIGURES.map(m => {
    const x = m.x * side;
    let left: number | undefined, right: number | undefined;
    for (const o of PLAY_FIGURES) {
      const v = o.x * side;
      if (v < x && (left === undefined || v > left)) left = v;
      else if (v > x && (right === undefined || v < right)) right = v;
    }
    const toward = (n: number | undefined) => n == null ? 16
      : Math.sign(n) !== Math.sign(x) ? Math.abs(x) - 22
      : Math.abs(n - x) / 2 + 1;
    return [toward(left), toward(right)] as const;
  });
  return { 1: build(1), [-1]: build(-1) };
})();
/** One crayon figure: hands out to its neighbours, as tall as she really is, with the one feature a
 *  child would draw her by. The strokes are fixed, so a frame only decides how much of each is drawn. */
type FigStroke = { pts: Pts; seed: number; w: number; a: number; b: number };
type Fig = { color: string; x: number; head: number; strokes: readonly FigStroke[] };
function buildFigure(m: (typeof PLAY_FIGURES)[number], i: number, side: 1 | -1): Fig {
  const [reachL, reachR] = REACH[side][i];
  const x = m.x * side, seed = 40 + i * 7;
  const h = PLAY_FIGURE_H * m.cm / 162, hr = 12;
  const head = -h + hr, arm = -h * .62;
  const strokes: FigStroke[] = [{ pts: circlePts(x, head, hr), seed, w: 3.5, a: 0, b: .3 }];
  const hair = (pts: Pts, s: number, w = 3) => strokes.push({ pts, seed: s, w, a: .25, b: .45 });
  if (m.hair === 'twin') {
    hair([[x - hr + 2, head - 4], [x - hr - 8, head + 2], [x - hr - 6, head + 12]], seed + 5);
    hair([[x + hr - 2, head - 4], [x + hr + 8, head + 2], [x + hr + 6, head + 12]], seed + 6);
  } else if (m.hair === 'long') {
    hair([[x - hr + 3, head - 8], [x - hr - 3, head + 6], [x - hr - 2, head + hr + 16]], seed + 5);
    hair([[x + hr - 3, head - 8], [x + hr + 3, head + 6], [x + hr + 2, head + hr + 16]], seed + 6);
  } else if (m.hair === 'bangs') {
    hair([[x - hr + 1, head - 5], [x + 2, head + 3], [x + hr - 1, head - 1]], seed + 5);
  } else {
    hair([[x + 2, head - hr - 1], [x + 10, head - hr - 7], [x + 10, head - hr + 3], [x + 2, head - hr - 1], [x - 6, head - hr - 7], [x - 6, head - hr + 3], [x + 2, head - hr - 1]], seed + 5, 2.5);
  }
  strokes.push(
    { pts: [[x, head + hr], [x, -h * .38]], seed: seed + 1, w: 3.5, a: .3, b: .5 },
    { pts: [[x - 13, 0], [x, -h * .38], [x + 13, 0]], seed: seed + 2, w: 3.5, a: .45, b: .7 },
    { pts: [[x - reachL, arm + 6], [x, arm], [x + reachR, arm + 6]], seed: seed + 3, w: 3.5, a: .6, b: 1 },
  );
  return { color: m.color, x, head, strokes };
}
const FIGS: Record<1 | -1, readonly Fig[]> = {
  1: PLAY_FIGURES.map((m, i) => buildFigure(m, i, 1)),
  [-1]: PLAY_FIGURES.map((m, i) => buildFigure(m, i, -1)),
};
function drawFigure(ctx: CanvasRenderingContext2D, fig: Fig, k: number): void {
  if (k <= 0) return;
  for (const s of fig.strokes) crayon(ctx, s.pts, fig.color, s.seed, span(k, s.a, s.b), s.w);
  // A smile, of course.
  if (k > .35) {
    ctx.save(); ctx.globalAlpha *= span(k, .35, .5);
    ctx.strokeStyle = fig.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(fig.x, fig.head + 1, 6, .3, Math.PI - .3); ctx.stroke();
    ctx.restore();
  }
}
function drawFigures(ctx: CanvasRenderingContext2D, t: number, side: number, only?: number): void {
  const figs = FIGS[sideOf(side)];
  for (let i = 0; i < figs.length; i++) {
    if (only != null && i !== only) continue;
    const start = (DRAW_FIGURE0 + i * DRAW_FIGURE_STEP) * PLAY_DRAW;
    drawFigure(ctx, figs[i], span(t, start, start + DRAW_FIGURE_LEN * PLAY_DRAW));
  }
}
/** Clip to one side of a jagged tear through (x0, y0) → (x1, y1); side 1 keeps the half to the right of
 *  the direction of travel. `ext` reaches far enough to cover the whole piece. */
function tearClip(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, side: 1 | -1, seed: number, ext: number): void {
  const n = 9;
  const nx = -(y1 - y0), ny = x1 - x0;
  const nl = Math.hypot(nx, ny) || 1;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const jag = i === 0 || i === n ? 0 : (hash(seed, i) - .5) * 10;
    const x = x0 + (x1 - x0) * u + nx / nl * jag, y = y0 + (y1 - y0) * u + ny / nl * jag;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(x1 + nx / nl * ext * side, y1 + ny / nl * ext * side);
  ctx.lineTo(x0 + nx / nl * ext * side, y0 + ny / nl * ext * side);
  ctx.closePath();
  ctx.clip();
}
/** A torn figure: two halves along a slash through the chest, sliding apart and falling. */
function drawTornFigure(ctx: CanvasRenderingContext2D, i: number, t: number, side: number, dt: number): void {
  const life = .7;
  if (dt > life) return;
  const x = PLAY_FIGURES[i].x * side;
  const k = dt / life;
  for (const s of [-1, 1] as const) {
    ctx.save();
    ctx.globalAlpha *= 1 - k * k;
    ctx.translate(s * 30 * dt, 60 * dt + 420 * dt * dt);
    ctx.rotate(s * dt * 1.6);
    tearClip(ctx, x - 30, -94, x + 30, -30, s, 70 + i, 120);
    drawFigures(ctx, t, side, i);
    ctx.restore();
  }
  if (dt < .1) {
    ctx.save();
    ctx.globalAlpha *= 1 - dt / .1;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 30, -94); ctx.lineTo(x + 30, -30); ctx.stroke();
    ctx.restore();
  }
}
/** Three crayon hearts float over the family while the house stands; each slash cracks one in two.
 *  The heart outline is one fixed shape; a frame only slides and scales it. */
const HEART_IN = .55;
const HEART_COLOR = ['#ff6f9e', '#ff8fb8', '#ff6f9e'] as const;
const HEART_N = 17;
const heartLocal: readonly (readonly [number, number])[] = Array.from({ length: HEART_N }, (_, i) => {
  const a = i / 16 * TAU;
  return [16 * Math.sin(a) ** 3 / 16, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16] as const;
});
const heartPts: [number, number][] = Array.from({ length: HEART_N }, () => [0, 0]);
function crayonHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, seed: number, k = 1): void {
  for (let i = 0; i < HEART_N; i++) {
    heartPts[i][0] = x + s * heartLocal[i][0];
    heartPts[i][1] = y + s * heartLocal[i][1];
  }
  crayon(ctx, heartPts, color, seed, k, 3);
}
function drawHearts(ctx: CanvasRenderingContext2D, t: number, side: number): void {
  for (let i = 0; i < PLAY_SLASHES.length; i++) {
    const appear = span(t, (HEART_IN + i * .12) * PLAY_DRAW, (HEART_IN + i * .12 + .3) * PLAY_DRAW);
    if (appear <= 0) continue;
    const x = (-60 + i * 60) * side, y = -ROOF - 30 - Math.sin(t * 2.2 + i * 1.7) * 6 - (i === 1 ? 14 : 0);
    const color = HEART_COLOR[i];
    const dt = t - PLAY_SLASHES[i];
    if (dt < 0) { crayonHeart(ctx, x, y, 13, color, 80 + i, appear); continue; }
    if (dt > .6) continue;
    // Cracked: the two halves part and drop.
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.globalAlpha *= 1 - dt / .6;
      ctx.translate(s * 10 * dt + s * 3, 160 * dt * dt + 6 * dt);
      ctx.rotate(s * dt * 1.5);
      ctx.beginPath(); ctx.rect(s < 0 ? x - 30 : x, y - 30, 30, 60); ctx.clip();
      crayonHeart(ctx, x, y, 13, color, 80 + i);
      ctx.restore();
    }
    if (dt < .12) crayon(ctx, [[x, y - 9], [x - 3, y - 2], [x + 3, y + 3], [x, y + 11]], '#ffffff', 85 + i, 1, 2.5);
  }
}
/** Everything that falls at the goodbye: the house and the one figure still holding their hand. */
function drawRest(ctx: CanvasRenderingContext2D, t: number, side: number): void {
  drawHouse(ctx, t, side);
  for (let i = 0; i < PLAY_FIGURES.length; i++) if (PLAY_FIGURES[i].tear >= PLAY_SLASHES.length) drawFigures(ctx, t, side, i);
}
function drawPlayhouse(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): void {
  const t = e.max - e.life;
  const side = e.dir ?? 1;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha = Math.min(1, e.life / .2);
  const bye = t - PLAY_BYE;
  // The three late slashes take a figure each.
  for (let i = 0; i < PLAY_FIGURES.length; i++) {
    const m = PLAY_FIGURES[i];
    if (m.tear >= PLAY_SLASHES.length) continue;
    const dt = t - tearAt(m.tear);
    if (dt < 0) drawFigures(ctx, t, side, i);
    else drawTornFigure(ctx, i, t, side, dt);
  }
  if (bye < 0) {
    drawHearts(ctx, t, side);
    drawRest(ctx, t, side);
  } else {
    // 再见: the house splits down the middle; the two halves lean apart and sink through the floor like a
    // stage set being struck, then what is left comes apart into scraps that the wind takes off the far side.
    const fall = easeIn(bye / .5);
    const gone = span(bye, .3, .62);
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-HW * 3, -ROOF * 2, HW * 6, ROOF * 2 + 4); ctx.clip();
      ctx.globalAlpha *= 1 - gone;
      ctx.translate(s * fall * 18, fall * 150);
      ctx.translate(s * HW, 0);
      ctx.rotate(s * fall * .32);
      ctx.translate(-s * HW, 0);
      tearClip(ctx, 4, -ROOF - 40, -4, 10, s === 1 ? -1 : 1, 91, 400);
      drawRest(ctx, t, side);
      ctx.restore();
    }
    if (bye < .1) {
      ctx.save();
      ctx.globalAlpha *= 1 - bye / .1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(4, -ROOF - 30); ctx.lineTo(-4, 0); ctx.stroke();
      ctx.restore();
    }
    // The scraps.
    const n = lite ? 10 : 18;
    const sk = span(bye, .22, 1.1);
    if (sk > 0 && sk < 1) {
      for (let i = 0; i < n; i++) {
        const u = clamp((sk - hash(i, 4) * .25) / .75, 0, 1);
        if (u <= 0) continue;
        const x0 = (hash(i, 1) - .5) * HW * 2.4, y0 = -hash(i, 2) * ROOF * .8;
        ctx.save();
        ctx.globalAlpha *= (1 - u) * .9;
        ctx.translate(x0 - side * u * (140 + hash(i, 3) * 160), y0 - u * (40 + hash(i, 5) * 90) + Math.sin(u * 6 + i) * 8);
        ctx.rotate(u * (hash(i, 6) - .5) * 9);
        ctx.fillStyle = PAPER;
        const w = 9 + hash(i, 7) * 9, h = 6 + hash(i, 8) * 7;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.fillStyle = SCRAP_COLORS[i % SCRAP_COLORS.length];
        ctx.fillRect(-w / 2, -h / 2, w, 2.5);
        ctx.restore();
      }
    }
  }
  ctx.restore();
}
/** Still standing: a few scraps drift back to where the house stood and lay out, faintly, the half of it on
 *  her side — wall, roof and door: the way back in. */
function drawMend(ctx: CanvasRenderingContext2D, e: Effect): void {
  const p = 1 - e.life / e.max;
  const k = ease(p / .6);
  const fade = Math.min(1, p / .15) * Math.min(1, e.life / .25);
  const side = e.dir ?? 1;
  ctx.save();
  ctx.translate(e.x, e.y);
  for (let i = 0; i < 8; i++) {
    const tx = side * (24 + (i % 4) * 30), ty = -36 - Math.floor(i / 4) * 64 - (i % 4) * 8;
    const sx = -side * (60 + hash(i, 3) * 160), sy = -60 - hash(i, 5) * 150;
    ctx.save();
    ctx.globalAlpha = fade * .7 * (1 - span(p, .65, 1) * .6);
    ctx.translate(sx + (tx - sx) * k, sy + (ty - sy) * k);
    ctx.rotate((1 - k) * (hash(i, 7) - .5) * 5);
    ctx.fillStyle = PAPER;
    ctx.fillRect(-10, -7, 20, 14);
    ctx.fillStyle = i % 2 ? '#d9583e' : '#a97a4b';
    ctx.fillRect(-10, -7, 20, 2.5);
    ctx.restore();
  }
  if (k > .6) {
    ctx.globalAlpha = fade * .75 * span(k, .6, 1);
    ctx.setLineDash([8, 6]);
    const [wall, roof, door] = MEND[sideOf(side)];
    crayon(ctx, wall, '#a97a4b', 1, 1, 3.5);
    crayon(ctx, roof, '#d9583e', 2, 1, 4);
    crayon(ctx, door, '#a97a4b', 4, 1, 3.5);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/* ---------- the rest ---------- */

export function drawMikuFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): boolean {
  wax = !lite;
  const p = 1 - e.life / e.max;
  const t = e.max - e.life;
  const dir = e.dir ?? 1;
  const r = e.radius ?? 40;
  switch (e.type) {
    case 'knock-knock': {
      // 先敲门！: two small knocks on the door, one after the other.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 2; i++) {
        const lt = t - i * .1;
        if (lt < 0) continue;
        const k = clamp(lt / .26, 0, 1);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = i ? MIKU : '#ffffff';
        ctx.beginPath(); ctx.arc(dir * i * 14, -i * 10, 8 + 20 * ease(k), 0, TAU); ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    /* ---- U 表面烤得很漂亮 ---- */
    case 'puff-smile': {
      // The polite surface: a soft shoujo-manga glow behind her head, a ring of twinkles slowly turning in it.
      ctx.save();
      ctx.translate(e.x, e.y);
      const a = Math.min(1, t / .08) * Math.min(1, e.life / .1);
      ctx.globalAlpha = a * .75;
      ctx.fillStyle = paint(ctx, 'smile', () => stops(ctx.createRadialGradient(0, 0, 4, 0, 0, 52), [[0, 'rgba(255,255,255,.95)'], [.55, 'rgba(214,243,255,.55)'], [1, 'rgba(214,243,255,0)']]));
      ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();
      ctx.globalAlpha = a;
      for (let i = 0; i < 6; i++) {
        const ang = i * TAU / 6 + t * 1.6 * dir;
        const rr = 44 + Math.sin(t * 9 + i) * 3;
        ctx.fillStyle = i % 2 ? '#ffd6ea' : '#ffffff';
        sparkle(ctx, Math.cos(ang) * rr, Math.sin(ang) * rr * .8, 4 + 2.5 * (.5 + .5 * Math.sin(t * 14 + i * 2)));
      }
      ctx.restore();
      return true;
    }
    case 'puff-split': {
      // The surface is cut: the glow splits along a line, the top half slides away ahead and the bottom half
      // sinks, the twinkles that were in it scattering — and nothing pretty is left behind her face.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = ease(t / .35);
      const fade = 1 - span(t, .12, .5);
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.globalAlpha = fade * .75;
        ctx.translate(s < 0 ? dir * k * 34 : -dir * k * 8, s < 0 ? -k * 12 : k * 16);
        ctx.rotate(s < 0 ? -dir * k * .25 : dir * k * .1);
        ctx.beginPath(); ctx.rect(-60, s < 0 ? -60 : 0, 120, 60); ctx.clip();
        ctx.fillStyle = paint(ctx, 'smile', () => stops(ctx.createRadialGradient(0, 0, 4, 0, 0, 52), [[0, 'rgba(255,255,255,.95)'], [.55, 'rgba(214,243,255,.55)'], [1, 'rgba(214,243,255,0)']]));
        ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = fade;
      for (let i = 0; i < 6; i++) {
        const ang = i * TAU / 6 + .3;
        const d = 44 + 40 * k;
        ctx.fillStyle = i % 2 ? '#ffd6ea' : '#ffffff';
        sparkle(ctx, Math.cos(ang) * d, Math.sin(ang) * d * .8 + easeIn(k) * 18, 4 * (1 - k * .6));
      }
      ctx.restore();
      return true;
    }
    case 'puff-poof': {
      // The blink: she comes apart into pastel sparkles (and, landing, they gather back with a soft pop).
      ctx.save();
      ctx.translate(e.x, e.y);
      const arrive = !!e.heavy;
      const k = ease(p);
      ctx.globalAlpha = (1 - span(p, .45, 1)) * .8;
      ctx.fillStyle = paint(ctx, 'poof', () => stops(ctx.createRadialGradient(0, 0, 4, 0, 0, 60), [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(214,243,255,0)']]));
      ctx.save(); ctx.scale(.55, 1.4); ctx.beginPath(); ctx.arc(0, 0, 60 * (arrive ? 1 - k * .5 : .6 + k * .5), 0, TAU); ctx.fill(); ctx.restore();
      ctx.globalAlpha = 1 - span(p, .5, 1);
      for (let i = 0; i < (lite ? 6 : 12); i++) {
        const a = hash(i, 1) * TAU, d0 = 10 + hash(i, 2) * 24, d1 = 44 + hash(i, 3) * 34;
        const d = arrive ? d1 + (d0 - d1) * k : d0 + (d1 - d0) * k;
        ctx.fillStyle = i % 3 === 0 ? '#ffd6ea' : i % 3 === 1 ? '#ffffff' : '#bfefff';
        sparkle(ctx, Math.cos(a) * d * .7, Math.sin(a) * d * 1.5 - (arrive ? 0 : k * 14), (3 + hash(i, 4) * 3.5) * (1 - p * .5));
      }
      if (arrive && p < .5) {
        ctx.globalAlpha = 1 - p * 2;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.save(); ctx.scale(.6, 1.3); ctx.beginPath(); ctx.arc(0, 0, 20 + 40 * ease(p * 2), 0, TAU); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      return true;
    }
    case 'cold-glint': {
      // The face drops: a thin cold glint crosses her eye, the way anime eyes catch the light.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = backOut(span(t, 0, .07)) * (1 - span(t, .2, e.max));
      ctx.globalAlpha = k;
      ctx.fillStyle = '#9fe8ff';
      ctx.save(); ctx.scale(1, .22); sparkle(ctx, 0, 0, 22 * k + 2, .12); ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.save(); ctx.scale(1, .14); sparkle(ctx, 0, 0, 17 * k + 1, .1); ctx.restore();
      sparkle(ctx, 0, 0, 5 * k, .2);
      ctx.restore();
      return true;
    }
    case 'puff-sparkle': {
      // The glide leaves a few pastel twinkles behind — the pretty surface.
      ctx.save();
      ctx.globalAlpha = (1 - p) * .9;
      ctx.fillStyle = e.color;
      sparkle(ctx, e.x - dir * p * 16, e.y - p * 12, r * (1 - p * .5));
      ctx.restore();
      return true;
    }
    case 'puff-pat': {
      // The pat: a soft little pop with two tiny hearts — nothing that looks like it hurt.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 8 + 14 * ease(p), 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffb3d4';
      heart(ctx, dir * 10, -14 - p * 18, 4);
      heart(ctx, -dir * 6, -10 - p * 24, 3);
      ctx.restore();
      return true;
    }
    case 'puff-cut': {
      // The cut: one clean white line straight through, the dark of the inside showing under it; then the
      // two edges part like something sliced open, and a few drops of ink fall.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      const draw = ease(t / .05);
      const part = ease(span(t, .1, .45));
      const fade = Math.min(1, e.life / .25);
      const L = -r, R = -r + 2 * r * draw;
      ctx.globalAlpha = fade * (e.hit ? .8 : .4);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(L + 10, 0); ctx.lineTo(R, 0); ctx.lineTo(R - 18, 3 + 6 * part); ctx.lineTo(L + 24, 2 + 3 * part);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.save();
      ctx.globalAlpha *= .35 * (1 - part);
      ctx.strokeStyle = '#bfe9ff';
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(R, 0); ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 4.5 * (1 - part * .5);
      ctx.beginPath(); ctx.moveTo(L, -part * 4); ctx.lineTo(R, -part * 4); ctx.stroke();
      if (part > 0) {
        ctx.globalAlpha = fade * .7;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(L + 16, 4 + part * 5); ctx.lineTo(R - 10, 4 + part * 5); ctx.stroke();
      }
      if (e.hit) {
        ctx.fillStyle = INK;
        ctx.globalAlpha = fade * .8;
        for (let i = 0; i < 3; i++) {
          const x = -r * .4 + i * r * .4, y = 8 + easeIn(span(t, .12 + i * .04, .5)) * 46;
          ctx.beginPath(); ctx.ellipse(x, y, 2, 3.2, 0, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      return true;
    }
    case 'miku-bubble': {
      // Her inner voice. Thoughts are round with a trail of little circles down to her head; the one
      // line she says out loud (再见) is a plain pale box.
      const n = clamp(Math.round(e.n ?? 0), 0, BUBBLES.length - 1);
      const said = n === 3;
      const text = BUBBLES[n];
      const k = backOut(Math.min(1, t / .14));
      const fade = Math.min(1, e.life / .2);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = fade * (said ? .85 : 1);
      ctx.font = `${said ? 15 : 13}px ${FONT}`;
      const w = ctx.measureText(text).width + 18, h = said ? 26 : 24;
      ctx.save();
      ctx.scale(k, k);
      ctx.fillStyle = said ? '#eef3f8' : '#f7fbff';
      ctx.strokeStyle = said ? '#9fb8d8' : e.color;
      ctx.lineWidth = 2;
      roundRect(ctx, -w / 2, -h / 2, w, h, said ? 6 : h / 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 1);
      ctx.restore();
      ctx.fillStyle = said ? '#eef3f8' : '#f7fbff';
      ctx.strokeStyle = said ? '#9fb8d8' : e.color;
      ctx.lineWidth = 1.5;
      if (said) {
        ctx.beginPath(); ctx.moveTo(-5, h / 2 * k - 1); ctx.lineTo(0, h / 2 * k + 7); ctx.lineTo(5, h / 2 * k - 1); ctx.fill();
      } else {
        for (let i = 0; i < 2; i++) {
          ctx.beginPath(); ctx.arc(-dir * (6 + i * 6), h / 2 + 6 + i * 8, (3.5 - i * 1.2) * k, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
      return true;
    }
    /* ---- I 珍稀动物认证 ---- */
    case 'tag-chop': {
      // The chop: one clean arc from over the shoulder down to the chest, two short streaks after it.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      const k = ease(t / .07);
      ctx.globalAlpha = 1 - span(t, .08, e.max);
      ctx.lineCap = 'round';
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(-r * .5, 0, r, -1.5, -1.5 + 1.9 * k); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-r * .5, 0, r, -1.5, -1.5 + 1.9 * k); ctx.stroke();
      ctx.globalAlpha *= .6;
      for (const o of [-10, 10]) { ctx.beginPath(); ctx.moveTo(r * .55 + o * .2, -12 + o); ctx.lineTo(r * .3 + o * .2, 22 + o); ctx.stroke(); }
      ctx.restore();
      return true;
    }
    case 'rare-stamp': {
      // 认证: a round seal comes down on them like an official stamp — 珍稀 in red, or 神兽 in gold once the tag
      // has been upgraded — with a thud ring and a few drops of ink; then it lifts off and the sign hangs.
      ctx.save();
      ctx.translate(e.x, e.y);
      const beast = (e.n ?? 0) > 0;
      const drop = span(t, 0, .09);
      const s = 1 + (1 - ease(drop)) * .8;
      const fade = 1 - span(t, .38, e.max);
      if (drop >= 1) {
        const k = span(t, .09, .35);
        ctx.globalAlpha = fade * (1 - k);
        ctx.strokeStyle = e.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 30 + 30 * ease(k), 0, TAU); ctx.stroke();
        ctx.fillStyle = e.color;
        for (let i = 0; i < 5; i++) {
          const a = hash(i, 3) * TAU, d = 32 + 18 * ease(k) + hash(i, 4) * 10;
          ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.2 + hash(i, 5) * 1.6, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = fade * Math.min(1, drop * 3);
      ctx.rotate(-.2 * dir);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(255,248,236,.9)';
      ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke();
      ctx.fillStyle = e.color;
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(beast ? '神兽' : '珍稀', 0, 1);
      if (beast) {
        ctx.fillStyle = '#fff1c2';
        for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + .4; sparkle(ctx, Math.cos(a) * 34, Math.sin(a) * 34, 5 * (1 - span(t, .1, .5))); }
      }
      ctx.restore();
      return true;
    }
    case 'rare-tag': {
      // 珍稀动物认证: a little zoo sign over their head. The upgrade flips it over to 奇葩神兽.
      const age = e.age ?? 1;
      const beast = (e.n ?? 0) > 0;
      const flip = beast && age < .26 ? age / .26 : 1;
      const showBeast = beast && flip > .5;
      const sx = beast && age < .26 ? Math.abs(Math.cos(Math.PI * flip)) : 1;
      const pop = beast ? 1 : backOut(Math.min(1, age / .16));
      const fade = Math.min(1, e.life / .4);
      ctx.save();
      ctx.translate(e.x, e.y + Math.sin(age * 2.4) * 1.5);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#6b4423';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-16, -13); ctx.lineTo(0, -24); ctx.lineTo(16, -13); ctx.stroke();
      ctx.scale(sx * pop, pop);
      ctx.fillStyle = showBeast ? '#9b5c34' : '#c89360';
      ctx.strokeStyle = '#5a361b';
      ctx.lineWidth = 2;
      roundRect(ctx, -40, -13, 80, 26, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = showBeast ? '#ffe2a8' : '#5a361b';
      ctx.beginPath(); ctx.ellipse(-29, 3, 4, 3.3, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-33 + i * 4, -3.5 + (i === 1 ? -1.5 : 0), 1.7, 0, TAU); ctx.fill(); }
      ctx.fillStyle = showBeast ? '#fff1d0' : '#3a2311';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(showBeast ? '奇葩神兽' : '珍稀动物', 7, 1);
      ctx.restore();
      if (showBeast && age < .55 && !lite) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const k = (age - .13) / .42;
        ctx.globalAlpha = fade * (1 - k);
        ctx.strokeStyle = '#ffd36a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, 44 + 22 * k, 18 + 10 * k, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      return true;
    }
    /* ---- O 才没有在撒谎 ---- */
    case 'innocent-aura': {
      // The act: a few pastel twinkles and a tiny heart drift up round her head — butter wouldn't melt.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, t / .1) * Math.min(1, e.life / .1);
      for (let i = 0; i < 4; i++) {
        const u = frac(t * .9 + i * .25);
        const x = (i % 2 ? 1 : -1) * (30 + hash(i, 1) * 14) * dir;
        const y = 20 - u * 46;
        ctx.globalAlpha *= 1;
        ctx.fillStyle = i === 2 ? '#ffb3d4' : i % 2 ? '#ffe3f1' : '#ffffff';
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * Math.sin(u * Math.PI);
        if (i === 2) heart(ctx, x, y, 4); else sparkle(ctx, x, y, 4.5);
        ctx.globalAlpha = a;
      }
      ctx.restore();
      return true;
    }
    case 'earlobe-glint': {
      // The tell: a small glint on her earlobe, ripples going out from it, faster the longer she keeps it up.
      const beat = Math.sin(t * (9 + t * 26));
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .08);
      const gap = Math.max(.1, .22 - t * .2);
      for (let i = 0; i < 2; i++) {
        const u = frac(t / gap - i * .5);
        ctx.save();
        ctx.globalAlpha *= (1 - u) * .7;
        ctx.strokeStyle = MIKU; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 5 + u * 16, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha *= .55 + .45 * beat;
      ctx.fillStyle = MIKU;
      sparkle(ctx, 0, 0, 7 + 2 * beat, .22);
      ctx.fillStyle = e.color;
      sparkle(ctx, 0, 0, 4 + 1.5 * beat, .25);
      ctx.restore();
      return true;
    }
    case 'caught-shock': {
      // Caught out: the manga gloom lines — a dark shade drops in behind her upper body and thin vertical
      // lines rain down it, the ガーン every reader knows. Soft-edged, behind the body, gone before the knee.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = ease(t / .07);
      const fade = 1 - span(t, .28, e.max);
      const cy = -150;
      ctx.globalAlpha = fade * k;
      ctx.save();
      ctx.translate(0, cy);
      ctx.scale(1, 1.7);
      ctx.fillStyle = paint(ctx, 'shock', () => stops(ctx.createRadialGradient(0, 0, 8, 0, 0, 62), [[0, 'rgba(20,27,48,.85)'], [.7, 'rgba(20,27,48,.55)'], [1, 'rgba(20,27,48,0)']]));
      ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = -48 + i * 12 + (hash(i, 1) - .5) * 4;
        const edge = 1 - Math.abs(x) / 58;
        const len = (40 + hash(i, 2) * 60) * edge;
        const y = cy - 100 + ((hash(i, 3) * 200 + t * 480) % 200);
        ctx.globalAlpha = fade * k * edge;
        ctx.strokeStyle = i % 3 === 1 ? e.color : '#e8f2ff';
        ctx.lineWidth = i % 3 === 1 ? 2.5 : 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'palm-burst': {
      // The palm heel: a flat comic impact — a white disc snaps out, a ring and short spikes round it.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = ease(t / .12);
      const a = (1 - p) * (e.hit ? 1 : .45);
      ctx.globalAlpha = a * (1 - span(t, 0, .1));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, r * .3, r * .6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3.5 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r * .45 * (.6 + k * .6), r * (.6 + k * .6), 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      const spin = (e.n ?? 0) * .55;
      for (let i = 0; i < 8; i++) {
        const ang = i * TAU / 8 + .2 + spin;
        const r0 = r * (.7 + k * .3), r1 = r0 + (i % 2 ? 10 : 18) * (1 - p);
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r0 * .55, Math.sin(ang) * r0); ctx.lineTo(Math.cos(ang) * r1 * .55, Math.sin(ang) * r1); ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'knee-star': {
      // The knee: a white star with her colour round it, and three shards kicked up off it.
      ctx.save();
      ctx.translate(e.x, e.y);
      const s = (r * .75) * backOut(Math.min(1, t / .08));
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ang = -Math.PI / 2 + (i - 1) * .45;
        const d0 = s + 4, d1 = s + 6 + 26 * ease(p);
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * d0, Math.sin(ang) * d0); ctx.lineTo(Math.cos(ang) * d1, Math.sin(ang) * d1); ctx.stroke();
      }
      ctx.rotate(p * .6);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10 - Math.PI / 2, rr = i % 2 ? s * .45 : s;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      return true;
    }
    /* ---- L 过家家到此为止 ---- */
    case 'bow-note': {
      // 「一直以来，多谢大家照顾了♪」: one bright little note bobbing over the bow.
      ctx.save();
      ctx.translate(e.x + 10, e.y - ease(t / .3) * 10 + Math.sin(t * 7) * 2);
      ctx.globalAlpha = Math.min(1, t / .1) * Math.min(1, e.life / .15);
      ctx.fillStyle = e.color;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(-4, 6, 5, 3.8, -.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(.5, 5); ctx.lineTo(.5, -12); ctx.quadraticCurveTo(7, -9, 8, -2); ctx.stroke();
      ctx.restore();
      return true;
    }
    case 'play-cut': {
      // The cut through them: a long thin white line at the chest, drawn in a flash; then its two edges
      // part like paper cut through, and it is gone.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      const draw = ease(t / .05);
      const part = ease(span(t, .12, .5));
      const L = -r, R = -r + 2 * r * draw;
      ctx.globalAlpha = Math.min(1, e.life / .25);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#bfe0ff';
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * .3 * (1 - part);
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(R, 0); ctx.stroke();
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * (1 - part * .5);
      for (const s of part > 0 ? [-1, 1] : [0]) {
        ctx.beginPath(); ctx.moveTo(L + Math.abs(s) * 12, s * part * 4); ctx.lineTo(R - Math.abs(s) * 12, s * part * 4); ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'play-slash': {
      // A slash catching up behind her: a quick white crack across a crayon figure. The goodbye is one long
      // stroke down the middle of the house, and the floor shudders.
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = ease(t / .06);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      if (e.heavy) {
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(4, -r * k); ctx.lineTo(-4 * k, r * .78 * k); ctx.stroke();
        const g = span(t, 0, .4);
        ctx.globalAlpha *= 1 - g;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, r * .78, 40 + 120 * ease(g), 8 + 10 * ease(g), 0, 0, TAU); ctx.stroke();
      } else {
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-r * .6 * k, -r * .7 * k); ctx.lineTo(r * .6 * k, r * .7 * k); ctx.stroke();
        ctx.fillStyle = PAPER;
        for (let i = 0; i < 3; i++) {
          const u = ease(span(t, 0, .35));
          ctx.globalAlpha = Math.min(1, e.life / .2) * (1 - u);
          ctx.fillRect((hash(i, 1) - .5) * 40 + (i - 1) * 18 * u, -10 - u * (20 + i * 10), 5, 4);
        }
      }
      ctx.restore();
      return true;
    }
    case 'play-cold': {
      // The stage loses its colour while the playhouse stands; the bodies, painted after this, stay clear,
      // and the crayon is the only colour left. A soft vignette keeps the eye in the middle.
      const fade = Math.min(1, t / .15) * Math.min(1, e.life / .3);
      ctx.save();
      ctx.globalAlpha = fade * .7;
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(28,46,82,.22)';
      ctx.fillRect(0, 0, W, H);
      if (!lite) {
        ctx.fillStyle = paint(ctx, 'cold-vig', () => stops(ctx.createRadialGradient(W / 2, H * .6, H * .35, W / 2, H * .6, W * .68), [[0, 'rgba(10,14,28,0)'], [1, 'rgba(10,14,28,.45)']]));
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
      return true;
    }
    case 'play-lights': {
      // The play: two warm stage spotlights come on over the house, flickering up. Every slash takes some of
      // the warmth out of them, and at the goodbye they go out.
      let tears = 0;
      for (let i = 0; i < PLAY_SLASHES.length; i++) if (t >= PLAY_SLASHES[i]) tears++;
      const warm = 1 - tears * .27;
      const on = span(t, 0, .12) * (t < .2 ? .6 + .4 * Math.sin(t * 90) : 1) * Math.min(1, e.life / .1);
      const k = on * warm;
      if (k <= 0) return true;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      // The warmth rides on the alpha already in the frame, so the beams and the pool stay one cached gradient each.
      ctx.globalAlpha *= k;
      const sy = -e.y - 10;
      for (const s of [-1, 1] as const) {
        const sx = s * 250;
        ctx.fillStyle = paint(ctx, s < 0 ? 'spot-l' : 'spot-r', () => stops(ctx.createLinearGradient(sx, sy, 0, 0), [[0, 'rgba(255,236,190,.26)'], [1, 'rgba(255,220,160,.1)']]));
        ctx.beginPath(); ctx.moveTo(sx - 16, sy); ctx.lineTo(sx + 16, sy); ctx.lineTo(s * 30 + 150, 0); ctx.lineTo(s * 30 - 150, 0); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = paint(ctx, 'spot-pool', () => stops(ctx.createRadialGradient(0, 0, 10, 0, 0, 170), [[0, 'rgba(255,230,180,.32)'], [1, 'rgba(255,230,180,0)']]));
      ctx.save(); ctx.scale(1, .22); ctx.beginPath(); ctx.arc(0, 0, 170, 0, TAU); ctx.fill(); ctx.restore();
      ctx.restore();
      return true;
    }
    case 'play-curtain': {
      // 再见 is the curtain call. Red velvet closes over the stage from both wings under a scalloped valance,
      // 完 is scrawled across the join in crayon, and then the whole thing flies up and is gone — with her
      // standing outside it.
      const C = PLAY_CURTAIN;
      const S = C.half, top = C.top;
      const close = ease(span(t, 0, C.close));
      const fly = easeIn(span(t, C.hold, C.gone));
      ctx.save();
      ctx.translate(e.x, e.y - fly * (top + 80));
      ctx.globalAlpha = 1 - fly * .6;
      // Shadow on the stage floor while it is down.
      if (fly < .1) {
        ctx.save(); ctx.globalAlpha *= .35 * close; ctx.fillStyle = '#000'; ctx.scale(1, .12);
        ctx.beginPath(); ctx.arc(0, 0, S + 10, 0, TAU); ctx.fill(); ctx.restore();
      }
      const fold = 22;
      // One velvet stripe and one vertical shade, slid across each fold. Built once per context.
      const velvet = paint(ctx, 'velvet', () => stops(ctx.createLinearGradient(0, 0, fold, 0), [[0, '#5e0816'], [.45, '#c4183a'], [.6, '#d8284a'], [1, '#6a0a1a']]));
      const shade = paint(ctx, 'velvet-shade', () => stops(ctx.createLinearGradient(0, -top, 0, 0), [[0, 'rgba(255,200,170,.12)'], [.7, 'rgba(0,0,0,0)'], [1, 'rgba(20,0,6,.35)']]));
      for (const side of [-1, 1]) {
        const w = S * close;
        if (w < 1) continue;
        const x0 = side < 0 ? -S : S - w;
        ctx.save();
        ctx.beginPath();
        // A slightly gathered hem at the bottom.
        ctx.moveTo(x0, -top);
        ctx.lineTo(x0 + w, -top);
        for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(x0 + w - w * u, 4 * Math.sin(u * Math.PI * 4 + side)); }
        ctx.closePath();
        ctx.clip();
        const n = Math.ceil(w / fold) + 1;
        ctx.fillStyle = velvet;
        for (let i = 0; i < n; i++) {
          ctx.save();
          ctx.translate(x0 + i * fold, 0);
          ctx.fillRect(0, -top, fold + .5, top + 8);
          ctx.restore();
        }
        // Light falls on the top, the hem is in shadow.
        ctx.fillStyle = shade;
        ctx.fillRect(x0, -top, w, top + 8);
        ctx.restore();
        // The leading edge, gold-trimmed.
        ctx.strokeStyle = '#e8c06a'; ctx.lineWidth = 2;
        const ex = side < 0 ? -S + w : S - w;
        ctx.beginPath(); ctx.moveTo(ex, -top + 30); ctx.lineTo(ex, 0); ctx.stroke();
      }
      // The valance across the top.
      const drop = ease(span(t, 0, .12));
      ctx.save();
      ctx.translate(0, -(1 - drop) * 40);
      ctx.fillStyle = '#7e0c22';
      ctx.beginPath();
      ctx.moveTo(-S - 14, -top - 6);
      ctx.lineTo(S + 14, -top - 6);
      const sc = 8;
      for (let i = 0; i <= sc; i++) {
        const x = S + 14 - (2 * S + 28) * i / sc;
        ctx.lineTo(x, -top + 28);
        if (i < sc) ctx.quadraticCurveTo(x - (S + 14) / sc, -top + 44, x - (2 * S + 28) / sc, -top + 28);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8c06a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-S - 14, -top + 24); ctx.lineTo(S + 14, -top + 24); ctx.stroke();
      ctx.restore();
      // 完, in crayon, once the curtains meet.
      const write = span(t, C.close, C.close + .18);
      if (write > 0) {
        ctx.save();
        ctx.globalAlpha *= write;
        ctx.translate(0, -top * .38);
        ctx.rotate(-.06);
        ctx.font = `bold 58px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,248,236,.35)';
        ctx.lineWidth = 7;
        ctx.strokeText('完', 1, 1);
        ctx.fillStyle = '#fff8ec';
        ctx.fillText('完', 0, 0);
        crayon(ctx, CURTAIN_LINE, '#fff8ec', 7, write, 3);
        crayon(ctx, CURTAIN_DOT_L, '#ffd1e0', 8, write, 2.5);
        crayon(ctx, CURTAIN_DOT_R, '#ffd1e0', 9, write, 2.5);
        ctx.restore();
      }
      ctx.restore();
      return true;
    }
    case 'playhouse':
      drawPlayhouse(ctx, e, lite);
      return true;
    case 'playhouse-mend':
      drawMend(ctx, e);
      return true;
  }
  return false;
}

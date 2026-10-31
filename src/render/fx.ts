import type { Effect, FightGame, FloatingText, Particle, Projectile } from '../game/game.ts';
import { holdNoteSpan, holdsNote, noteCaught, NOTE_FROM, SHIP_HOLD, SHIP_SWEEP } from '../game/combat.ts';
import type { Fighter } from '../game/fighter.ts';
import type { FighterView } from './view.ts';
import { clamp, FLOOR, H, SIDE, W } from '../game/constants.ts';
import type { ImageCache } from '../assets/loader.ts';
import { BURDEN_Y, CELL, clipFor, FAMILY_LINGER, OBLIVION, FAMILY_MEMBERS, flameFrame, pillarFrame, practiceBeat, practiceStrums, PRACTICE_HITS, RAIKA_CM, RING_BIG, RING_SMALL } from './clips.ts';
import { watchProp } from './propLayout.ts';
import { bloodSparkles, drawSakikoFx, drawShiroFloor } from './sakikoFx.ts';

const CUCUMBER_SRC = '/sprites/mutsumi/cucumber.png';
const NOTE_SRC = '/sprites/mutsumi/note.png';
const MANJU_SRC = '/sprites/hotaru/cookie.png';
/** 狼王来了: 4×3 claw slashes on black, drawn additively. Rows: light / heavy pounce / air; columns are frames. */
const CLAW_SRC = '/sprites/natsume/claw.png';
/** Frame boundaries over the .33s life: quick sweep, a held full slash, then the fade and the sparks. */
const CLAW_FRAMES = [.05, .14, .24];
const HOTARU_PIANO_SRC = '/sprites/hotaru/piano.png';
const MORTIS_SRC = '/sprites/mutsumi/mortis.png';
const KIT_SRC = '/sprites/nyamu/kit.png';
const PIANO_SRC = '/sprites/kanata/piano.png';
const MILK_SRC = '/sprites/umiri/milk.png';
const BAG_SRC = '/sprites/umiri/bag.png';
const GUITAR_SRC = '/sprites/anon/guitar.png';
/** Headstock on the current guitar sheet. The body is the far end, so the pivot is not the image center. */
const GUITAR_HEAD_X = 438 / 512;
const GUITAR_HEAD_Y = 122 / 256;
const LAYER_BASS_SRC = '/sprites/layer/bass.png';
/** Neck/body joint on the 512×256 bass. Rotation pivots here. */
const LAYER_BASS_GRIP = { x: 212, y: 122 };
/** 燃尽 windup, hit, recover. Recover size 0 leaves the hands empty. */
const LAYER_BASS_POSES = [
  { x: -60, y: -242, rot: 1.18, size: 220 },
  { x: 136, y: -54, rot: 3.24, size: 220 },
  { x: 0, y: 0, rot: 0, size: 0 },
] as const;
const MITAKE_GUITAR_SRC = '/sprites/mitake/guitar.png';
/** Grip and round-body center on the 2048×1024 sheet, after the tuned gx offset. */
const MITAKE_GRIP = { x: 462, y: 597 };
const MITAKE_BODY_ANG = Math.atan2(569 - 597, 1617 - 462);
/** Windup, hit, recover. deg: 0 is forward, positive is up. rot is added on top. */
const MITAKE_POSES = [
  { x: -38, y: -150, rot: 4.56, size: 160, deg: 45 },
  { x: 35, y: -45, rot: 0.3, size: 160, deg: 0 },
  { x: 0, y: 0, rot: 0, size: 0, deg: -20 },
] as const;
const ANON_NOTE_SRC = '/sprites/anon/note.png';
const SOYO_NOTE_SRC = '/sprites/soyo/note.png';
const HEART_SRC = '/sprites/anon/heart.png';
const STONE_SRC = '/sprites/tomori/stone.png';
const PLASTER_SRC = '/sprites/tomori/plaster.png';
/** 忘却之影: the gentle 白祥 she leaves behind, a whole standing figure on one 256 cell. */
const SHIRO_SRC = '/sprites/sakiko/shiro.png';
/** 康乃馨盛开之日: the upright coffin, front face to the screen, on a 512×512 square with the flowers
 *  round its foot. COFFIN_SIZE is the square's side on stage; the art's foot sits COFFIN_FOOT of the
 *  way down the square, so that line goes on the floor. Drawn at the picture's own aspect. */
const COFFIN_SRC = '/sprites/houka/coffin.png';
const COFFIN_SIZE = 280;
const COFFIN_FOOT = 492 / 512;
const PARFAIT_SRC = '/sprites/rana/parfait.png';
const MATCHA_SRC = '/sprites/rana/matcha.png';
const SEAL_SRC = '/sprites/miyako/seal.png';
const FUGA_ARROW_SRC = '/sprites/viola/fuga-arrow.png';
const FUGA_BURST_SRC = '/sprites/viola/fuga-burst.png';
const MEAT_SRC = '/sprites/yuno/meat.png';
const YUNO_NOTE_SRC = '/sprites/yuno/note.png';
const CHUCHU_JERKY_SRC = '/sprites/chuchu/jerky.png';
const CHUCHU_CAKE_SRC = '/sprites/chuchu/cake.png';
const DONUT_STRAW_SRC = '/sprites/mana/donut-straw.png';
const DONUT_CHOC_SRC = '/sprites/mana/donut-choc.png';
const MANA_HEART_SRC = '/sprites/mana/heart.png';
const SHIP_SRC = '/sprites/kokoro/ship.png';
const BALL_SRC = '/sprites/kokoro/ball.png';
const WAVE_SRC = '/sprites/kokoro/wave.png';
const KASUMI_STAR_SRC = '/sprites/kasumi/star.png';
const PILLAR_SRC = '/sprites/yukina/pillar.png';
const ARROW_SRC = '/sprites/sayo/arrow.png';
const FLAME_SRC = '/sprites/sayo/flame.png';
/** 纱夜火舌画在格子里偏上。播放时整格下移这么多，火舌才贴到脚线。判定仍钉在弹道上。 */
const FLAME_DROP = 30;
/** 我的世界火焰的三帧。坐标是像素格，颜色 0 深 / 1 中 / 2 亮。 */
const MC_FLAME: readonly (readonly [number, number, number])[][] = [
  [[0, -4, 2], [-1, -3, 1], [0, -3, 2], [1, -3, 1], [-2, -2, 0], [-1, -2, 1], [0, -2, 2], [1, -2, 1], [2, -2, 0], [-1, -1, 1], [0, -1, 2], [1, -1, 1], [0, 0, 1]],
  [[-1, -4, 2], [0, -4, 1], [-2, -3, 1], [-1, -3, 2], [0, -3, 1], [1, -3, 0], [-2, -2, 0], [-1, -2, 2], [0, -2, 2], [1, -2, 1], [2, -2, 0], [-1, -1, 1], [0, -1, 1], [1, -1, 0], [0, 0, 0]],
  [[1, -4, 2], [0, -4, 1], [-1, -3, 0], [0, -3, 1], [1, -3, 2], [2, -3, 1], [-2, -2, 0], [-1, -2, 1], [0, -2, 2], [1, -2, 2], [2, -2, 0], [-1, -1, 0], [0, -1, 1], [1, -1, 1], [0, 0, 1]],
];
const MC_FLAME_INK = ['#1a3a8a', '#3d7cff', '#e8f7ff'];

/** Phones skip canvas filters and high-quality resamples. `body.touch` comes from device.ts. */
function phoneRaster(): boolean {
  return typeof document !== 'undefined' && !!document.body?.classList.contains('touch');
}

/** ponytail: one lite tier, switched on once and kept for the session — it never steps back up,
 *  so it cannot oscillate. More tiers or recovery would need hysteresis between bands. */
let liteFx = false;
export function isLiteFx(): boolean { return liteFx; }
export function setLiteFx(on: boolean): void { liteFx = on; }
/** Average frame gap that trips the lite tier: roughly 42fps or worse, sustained. */
export const LITE_MS = 24;
export function shouldGoLite(avgMs: number, touch: boolean): boolean {
  return touch && avgMs > LITE_MS;
}

/** ponytail: one 36-slot scratch for jewel-ring. Rings draw one after another, so the next call refills it. */
const JEWEL_PUFFS: { x: number; y: number; frame: number; shrink: number; alpha: number }[] = [];
for (let i = 0; i < 36; i++) JEWEL_PUFFS.push({ x: 0, y: 0, frame: 0, shrink: 1, alpha: 1 });

function sortJewelPuffs(n: number): void {
  for (let i = 1; i < n; i++) {
    const bit = JEWEL_PUFFS[i];
    let j = i - 1;
    while (j >= 0 && JEWEL_PUFFS[j].y > bit.y) {
      JEWEL_PUFFS[j + 1] = JEWEL_PUFFS[j];
      j--;
    }
    JEWEL_PUFFS[j + 1] = bit;
  }
}

/** Declaration light is constant colour. Gradients stick to the context that built them. */
let declOwner: CanvasRenderingContext2D | null = null;
let declBeamG: CanvasGradient | null = null;
let declGlowG: CanvasGradient | null = null;
let declPoolG: CanvasGradient | null = null;
function declarationPaint(ctx: CanvasRenderingContext2D): { beam: CanvasGradient; glow: CanvasGradient; pool: CanvasGradient } {
  if (declOwner !== ctx || !declBeamG || !declGlowG || !declPoolG) {
    declOwner = ctx;
    declBeamG = ctx.createLinearGradient(0, 0, 0, FLOOR);
    declBeamG.addColorStop(0, 'rgba(238, 0, 34, .3)');
    declBeamG.addColorStop(1, 'rgba(238, 0, 34, .06)');
    declGlowG = ctx.createRadialGradient(0, 0, 6, 0, 0, 90);
    declGlowG.addColorStop(0, 'rgba(255, 214, 224, .26)');
    declGlowG.addColorStop(1, 'rgba(238, 0, 34, 0)');
    declPoolG = ctx.createRadialGradient(0, 0, 8, 0, 0, 105);
    declPoolG.addColorStop(0, 'rgba(238, 0, 34, .38)');
    declPoolG.addColorStop(1, 'rgba(238, 0, 34, 0)');
  }
  return { beam: declBeamG, glow: declGlowG, pool: declPoolG };
}

/** 完全复活: the same pillar as 宣战布告, in gold. Cached for the same reason. */
let reviveOwner: CanvasRenderingContext2D | null = null;
let reviveBeamG: CanvasGradient | null = null;
let reviveGlowG: CanvasGradient | null = null;
let revivePoolG: CanvasGradient | null = null;
function revivePaint(ctx: CanvasRenderingContext2D): { beam: CanvasGradient; glow: CanvasGradient; pool: CanvasGradient } {
  if (reviveOwner !== ctx || !reviveBeamG || !reviveGlowG || !revivePoolG) {
    reviveOwner = ctx;
    reviveBeamG = ctx.createLinearGradient(0, 0, 0, FLOOR);
    reviveBeamG.addColorStop(0, 'rgba(255, 210, 74, .32)');
    reviveBeamG.addColorStop(1, 'rgba(255, 210, 74, .07)');
    reviveGlowG = ctx.createRadialGradient(0, 0, 6, 0, 0, 90);
    reviveGlowG.addColorStop(0, 'rgba(255, 246, 200, .28)');
    reviveGlowG.addColorStop(1, 'rgba(255, 210, 74, 0)');
    revivePoolG = ctx.createRadialGradient(0, 0, 8, 0, 0, 105);
    revivePoolG.addColorStop(0, 'rgba(255, 210, 74, .4)');
    revivePoolG.addColorStop(1, 'rgba(255, 210, 74, 0)');
  }
  return { beam: reviveBeamG, glow: reviveGlowG, pool: revivePoolG };
}

/** ponytail: dusk shots reuse a gradient per colour and rounded width. Cap 8; a ninth colour rebuilds. */
let duskOwner: CanvasRenderingContext2D | null = null;
const duskGrads = new Map<string, CanvasGradient>();
function duskGrad(ctx: CanvasRenderingContext2D, color: string, w: number): CanvasGradient {
  if (duskOwner !== ctx) { duskOwner = ctx; duskGrads.clear(); }
  const span = Math.round(w);
  const key = color + '|' + span;
  let grad = duskGrads.get(key);
  if (grad) return grad;
  if (duskGrads.size >= 8) duskGrads.clear();
  grad = ctx.createLinearGradient(-span, 0, span * .2, 0);
  grad.addColorStop(0, '#e8a060');
  grad.addColorStop(1, color);
  duskGrads.set(key, grad);
  return grad;
}
/** 忍法·隐身术: soft smoke edge — one unit-radius radial gradient, scaled per puff.
    Gradients stick to the context that built them, so it is rebuilt when the context swaps. */
let cloakOwner: CanvasRenderingContext2D | null = null;
let cloakGrad: CanvasGradient | null = null;
function smokeGrad(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (cloakOwner !== ctx || !cloakGrad) {
    cloakOwner = ctx;
    cloakGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    cloakGrad.addColorStop(0, 'rgba(246, 241, 255, .95)');
    cloakGrad.addColorStop(.5, 'rgba(226, 214, 255, .5)');
    cloakGrad.addColorStop(1, 'rgba(210, 196, 255, 0)');
  }
  return cloakGrad;
}
const JELLY_SRC = '/sprites/mashiro/jelly.png';const WHALE_SRC = '/sprites/mashiro/whale.png';
const SPROUT_SRC = '/sprites/tsukushi/sprout.png';
const WHEEL_SRC = '/sprites/tsukushi/wheel.png';
const MORTIS_H = 181;

/* Drop the pose-sheet chrome and the chroma key so a placeholder can sit in the fight. */
const cutCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

function keyed(im: HTMLImageElement): CanvasImageSource {
  const hit = cutCache.get(im);
  if (hit) return hit;
  if (typeof document === 'undefined' || !im.naturalWidth) return im;
  const canvas = document.createElement('canvas');
  canvas.width = im.naturalWidth;
  canvas.height = im.naturalHeight;
  const g = canvas.getContext('2d');
  if (!g) return im;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gv = px[i + 1], b = px[i + 2];
    const chroma = gv > 240 && r < 20 && b < 20;
    const sheet = Math.abs(r - 26) <= 3 && Math.abs(gv - 21) <= 3 && Math.abs(b - 40) <= 3;
    const grid = Math.abs(r - 255) <= 8 && Math.abs(gv - 54) <= 12 && Math.abs(b - 200) <= 12;
    if (chroma || sheet || grid) px[i + 3] = 0;
  }
  g.putImageData(data, 0, 0);
  cutCache.set(im, canvas);
  return canvas;
}

function prop(ctx: CanvasRenderingContext2D, images: ImageCache | undefined, src: string, size: number): boolean {
  const im = images?.get(src);
  if (!im?.naturalWidth) return false;
  const s = Math.max(16, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = phoneRaster() ? 'low' : 'high';
  ctx.drawImage(keyed(im), -s / 2, -s / 2, s, s);
  return true;
}

/** Dash, grab, punch, kick, punch, kick, then the exit stance. */
function mortisFrame(p: number): [number, number] {
  if (p < 0.08) return [0, 0];
  if (p < 0.16) return [0, 1];
  if (p < 0.26) return [0, 2];
  if (p < 0.34) return [1, 1];
  if (p >= 0.74) return [3, 2];
  const beats: [number, number][] = [[2, 1], [3, 1], [2, 1], [3, 1]];
  return beats[Math.min(3, Math.floor((p - 0.34) / 0.1))];
}

/** The pose she just left, while the flurry is still going. Null on the approach and the exit. */
export function mortisAfterimage(p: number): [number, number] | null {
  if (p < 0.34 || p >= 0.74) return null;
  const cur = mortisFrame(p);
  const prev = mortisFrame(p - 0.1);
  if (prev[0] === cur[0] && prev[1] === cur[1]) return null;
  return prev;
}

const silhouetteCache = new WeakMap<CanvasImageSource, Map<string, HTMLCanvasElement>>();

/** A flat single-colour silhouette of any image, source-atop like the mortis ghost.
 *  ponytail: the result is pure per (source, size, colour), so it bakes once; the per-src
 *  map stays tiny (one effect, one colour each) and clears rather than growing. */
function tintedSilhouette(src: CanvasImageSource, w: number, h: number, color: string): CanvasImageSource | null {
  if (typeof document === 'undefined') return null;
  const bw = Math.round(w), bh = Math.round(h);
  let perSrc = silhouetteCache.get(src);
  if (!perSrc) { perSrc = new Map(); silhouetteCache.set(src, perSrc); }
  const key = bw + 'x' + bh + '|' + color;
  const hit = perSrc.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0, bw, bh);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, bw, bh);
  if (perSrc.size >= 8) perSrc.clear();
  perSrc.set(key, canvas);
  return canvas;
}

/** The whole keyed sheet is tinted once; each frame only cuts its cell out of that bake. */
function drawMortisGhost(ctx: CanvasRenderingContext2D, im: HTMLImageElement, col: number, row: number, alpha: number): void {
  const sheet = keyed(im);
  const sil = tintedSilhouette(sheet, im.naturalWidth, im.naturalHeight, '#c8ffd2');
  if (!sil) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sil, col * CELL, row * CELL, CELL, CELL, -10 - MORTIS_H / 2, -MORTIS_H, MORTIS_H, MORTIS_H);
  ctx.restore();
}

/** 我开动了！: the rice mountain's height over the bowl, full and after each of the three mouthfuls. */
const MEAL_HEAP = [62, 40, 20, 5] as const;

/** 上吧，My Family！: one colour-block column per member (千樱梨 / 蓬咲 / 宁月 / 心玖), rows in / strike / stand.
 *  Drawn as glowing silhouettes in each member's colour with the art faintly showing through (FAMILY_SHOW). */
const FAMILY_SRC = '/sprites/raika/family.png';
/** 上吧，My Family！: where a member is and how she is drawn at `u` seconds after she appears.
 *  x is +dir toward and past the foe, measured from the strike point; y is up off the floor.
 *  `door` is the door of light behind 蕾叶 (a negative x). Rotation and squash are about her middle. */
interface FamilyPose { x: number; y: number; rot: number; sx: number; sy: number; a: number; row: number; glow: number }
/** ponytail: family-member refills these instead of allocating a pose per sample. One effect
 *  finishes before the next starts, and nothing keeps a pose, so four slots cover the body
 *  (now/before) and one trail sample. A reentrant second pose draw would clobber them;
 *  family-lineup does not use this. */
const FAMILY_POSE: FamilyPose[] = [
  { x: 0, y: 0, rot: 0, sx: 1, sy: 1, a: 1, row: 0, glow: 0 },
  { x: 0, y: 0, rot: 0, sx: 1, sy: 1, a: 1, row: 0, glow: 0 },
  { x: 0, y: 0, rot: 0, sx: 1, sy: 1, a: 1, row: 0, glow: 0 },
  { x: 0, y: 0, rot: 0, sx: 1, sy: 1, a: 1, row: 0, glow: 0 },
];
const easeInOut = (k: number) => k < .5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
/** A strike's squash: a fast drop and a bounce back over FAMILY_SQUASH seconds. */
const FAMILY_SQUASH = .12;
/** After her last strike she holds this long, then dissolves into motes of her own light. */
const FAMILY_HOLD = .1;
function familyPose(n: number, u: number, door: number, out: FamilyPose): FamilyPose {
  const m = FAMILY_MEMBERS[n];
  const E = m.enter;
  const S1 = E + (m.strikes[m.strikes.length - 1] - m.strikes[0]);
  out.x = 0; out.y = 0; out.rot = 0; out.sx = 1; out.sy = 1; out.a = 1; out.row = 0; out.glow = 0;
  // Squash on every strike, and the strike cell around it.
  for (const st of m.strikes) {
    const v = u - (E + st - m.strikes[0]);
    if (v > -.05 && v < .14) out.row = 1;
    if (v >= 0 && v < FAMILY_SQUASH) {
      const q = Math.sin(v / FAMILY_SQUASH * Math.PI);
      out.sx = 1 + q * .18;
      out.sy = 1 - q * .16;
      out.glow = Math.max(out.glow, q);
    }
  }
  if (n === 0) {
    // 千樱梨: out of the door in one big forward flip, comes down over them and drums on them from above.
    if (u < E) {
      const k = Math.max(0, u) / E;
      const e = easeInOut(k);
      out.x = door + 10 + (-26 - door - 10) * e;
      out.y = 60 * k + 4 * 190 * k * (1 - k);
      out.rot = -Math.PI * 2 * e;
    } else {
      out.x = -26;
      out.y = 60 + Math.sin(u * 18) * 3 - (out.row ? 18 : 0);
      out.rot = out.row ? .12 : 0;
    }
  } else if (n === 1) {
    // 蓬咲: peeks round the door frame first (leaning out, not all the way), then bolts.
    const peek = E * .55;
    if (u < peek) {
      const k = easeOut(Math.max(0, u) / peek);
      out.x = door + 16 * k;
      out.rot = -.22 * k;
      out.a = .85;
    } else if (u < E) {
      const k = (u - peek) / (E - peek);
      out.x = door + 16 + (-4 - door - 16) * k * k;
      out.rot = .18 * k;
    } else {
      out.x = -4;
      out.rot = out.row ? .2 : .05;
    }
  } else if (n === 2) {
    // 宁月: a high hop up over them, a breath at the top, then straight down onto them.
    const rise = E * .62;
    if (u < rise) {
      const k = Math.max(0, u) / rise;
      out.x = door + (0 - door) * easeOut(k);
      out.y = 180 * Math.sin(k * Math.PI / 2);
      out.rot = -.25 * Math.sin(k * Math.PI);
    } else if (u < E) {
      const k = (u - rise) / (E - rise);
      out.x = 0;
      out.y = 180 - 146 * k * k;
    } else {
      out.x = 0;
      out.y = 34;
    }
  } else {
    // 心玖: steps out of the door, crouches — and is gone. A beat later she stands past them, the cut done.
    const blink = E * .55;
    if (u < blink) {
      out.x = door + 8 * easeOut(Math.max(0, u) / blink);
      out.a = Math.min(1, u / .06);
    } else if (u < E) {
      out.x = 84;
      out.a = 0;
    } else {
      out.x = 84;
      out.row = u < E + .2 ? 1 : 2;
    }
  }
  // Dissolve: she holds, then lifts into light.
  const fade = u - (S1 + FAMILY_HOLD);
  if (fade > 0) {
    const k = Math.min(1, fade / FAMILY_LINGER);
    out.a *= 1 - k;
    out.sx *= 1 + k * .18;
    out.sy *= 1 + k * .18;
    out.glow = Math.max(out.glow, k);
    out.row = 2;
  }
  // Coming out of the door: a quick flare as she steps through.
  if (u < .1) out.glow = Math.max(out.glow, 1 - Math.max(0, u) / .1);
  return out;
}

/** 上吧，My Family！: how much of the real art shows through the colour wash — enough to tell who
 *  she is, still read as a glowing silhouette. 0 is a flat silhouette, 1 the plain art. */
const FAMILY_SHOW = .35;

/** One member, in her colour with a soft white rim and the art faintly showing through. Falls back
 *  to a capsule figure until family.png is in the cache. */
function drawFamilySilhouette(ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, n: number, row: number, h: number, color: string, alpha: number, glow = 0): void {
  if (alpha <= 0) return;
  if (im?.naturalWidth) {
    const sheet = keyed(im);
    const sil = tintedSilhouette(sheet, im.naturalWidth, im.naturalHeight, color);
    const rim = tintedSilhouette(sheet, im.naturalWidth, im.naturalHeight, '#ffffff');
    if (!sil || !rim) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = phoneRaster() ? 'low' : 'high';
    const big = h * 1.08;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha * (.38 + glow * .5));
    ctx.drawImage(rim, n * CELL, row * CELL, CELL, CELL, -big / 2, -big + h * .03, big, big);
    if (glow > .05) {
      const huge = h * (1.08 + glow * .12);
      ctx.globalAlpha = alpha * glow * .45;
      ctx.drawImage(sil, n * CELL, row * CELL, CELL, CELL, -huge / 2, -huge + h * .05, huge, huge);
    }
    ctx.restore();
    // The art first, then the same shape in her colour over it: the wash covers all but FAMILY_SHOW.
    ctx.globalAlpha = alpha;
    ctx.drawImage(sheet, n * CELL, row * CELL, CELL, CELL, -h / 2, -h, h, h);
    ctx.globalAlpha = alpha * (1 - FAMILY_SHOW);
    ctx.drawImage(sil, n * CELL, row * CELL, CELL, CELL, -h / 2, -h, h, h);
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(-9, -h * .66, 18, h * .4);
  ctx.fillRect(-8, -h * .28, 6, h * .28);
  ctx.fillRect(2, -h * .28, 6, h * .28);
  ctx.beginPath(); ctx.arc(0, -h * .76, h * .09, 0, Math.PI * 2); ctx.fill();
}

/** Place one sample of a family member. `q` and `prev` are a 1/60s pair so the stretch follows
 *  her motion. Trail samples pass glow 0: the bloom is the body's, not the afterimage's. */
function paintFamilyAt(
  ctx: CanvasRenderingContext2D, im: HTMLImageElement | undefined, n: number, color: string, h: number, dir: number,
  ox: number, oy: number, q: FamilyPose, prev: FamilyPose, alphaMul: number, trail: boolean,
): void {
  if (q.a * alphaMul <= .01) return;
  const vx = (q.x - prev.x) * 60, vy = (q.y - prev.y) * 60;
  const speed = Math.hypot(vx, vy);
  ctx.save();
  ctx.translate(ox + dir * q.x, oy - q.y);
  ctx.scale(dir, 1);
  ctx.translate(0, -h / 2);
  if (speed > 80) {
    const ang = Math.atan2(-vy, vx);
    const k = Math.min(.3, speed / 2600);
    ctx.rotate(ang);
    ctx.scale(1 + k, 1 - k * .55);
    ctx.rotate(-ang);
  }
  ctx.rotate(q.rot);
  ctx.scale(q.sx, q.sy);
  ctx.translate(0, h / 2);
  drawFamilySilhouette(ctx, im, n, q.row, h, color, q.a * alphaMul, trail ? 0 : q.glow);
  ctx.restore();
}

/* Effects are looked up by `type` (from the engine) and projectiles by `fx` (from skill data). Add a case, not an if-chain elsewhere. */

/** 剪: one spindle slash — thick in the middle, tapering to points at both ends, thin dark edge.
    Drawn centred at the origin along the local x axis; the caller positions and rotates it. */
function slashSpindle(ctx: CanvasRenderingContext2D, len: number, wid: number, fill: string, edge: string): void {
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -wid, len / 2, 0);
  ctx.quadraticCurveTo(0, wid, -len / 2, 0);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** 剑道三连: a crescent blade trail — an arc of half-width `halfW` that tapers to sharp points
    at both ends (thin at a0, fat in the middle, thin again at a1). One filled path, no shadow.
    Caller sets fillStyle / globalAlpha. */
function arcBladePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, a0: number, a1: number, halfW: number, samples = 12): void {
  const w = (s: number) => halfW * Math.pow(Math.sin(Math.PI * s), .7);
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const s = i / samples, a = a0 + (a1 - a0) * s, ro = R + w(s);
    const px = cx + Math.cos(a) * ro, py = cy + Math.sin(a) * ro;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  for (let i = samples; i >= 0; i--) {
    const s = i / samples, a = a0 + (a1 - a0) * s, ri = R - w(s);
    ctx.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
  }
  ctx.closePath();
}

/** 康乃馨盛开之日: a wreath of small five-petal blossoms sitting just outside a ring, faces to the
 *  screen like the ring itself. `open` 0 is a tight bud, 1 a flower spread wide; `alpha` stays low so
 *  the ring's own line is still the clearest edge. Alternate blossoms are a size smaller. */
function blossomWreath(ctx: CanvasRenderingContext2D, rad: number, n: number, size: number, open: number, alpha: number, spin: number): void {
  if (alpha <= 0 || size <= 1) return;
  ctx.save();
  const orbit = rad + size * .55;
  const d = size * (.18 + open * .36), rx = size * (.26 + open * .16), ry = size * (.2 + open * .1);
  // One gradient serves every petal: they all share the same local frame. Lite mode paints flat.
  let fill: string | CanvasGradient = '#ffb6e6';
  if (!liteFx) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, -d, rx * 1.6);
    g.addColorStop(0, '#ff8fd8');
    g.addColorStop(1, '#fff3fb');
    fill = g;
  }
  ctx.fillStyle = fill;
  for (let i = 0; i < n; i++) {
    const ang = spin + i / n * Math.PI * 2;
    ctx.save();
    ctx.translate(Math.cos(ang) * orbit, Math.sin(ang) * orbit);
    ctx.rotate(ang * 2 + i);
    const v = i % 2 ? .82 : 1;
    ctx.scale(v, v);
    ctx.globalAlpha = alpha;
    for (let j = 0; j < 5; j++) {
      ctx.save();
      ctx.rotate(j / 5 * Math.PI * 2);
      ctx.beginPath(); ctx.ellipse(0, -d, ry, rx, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = Math.min(1, alpha * 1.5);
    ctx.fillStyle = '#ffe9a3';
    ctx.beginPath(); ctx.arc(0, 0, size * .1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** 双踩地狱 rain, drawn under the note at its own origin. A falling note marks where it will land, firmer as
 *  it comes down (red for the big last wave), so there is something to walk out of; above it hangs a thin
 *  streak — a tapered sliver in its colour, a pale core and two short side drips that shimmer — so a wave
 *  reads as rain, not as balls. Flat fills only, no gradient, no save/restore: alpha is put back at the end. */
function rainTrail(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const big = p.radius > 12;
  const r = p.radius;
  const left = Math.max(0, FLOOR - p.y);
  const near = 1 - Math.min(1, left / 480);
  ctx.globalAlpha = .18 + near * .45;
  ctx.fillStyle = big ? '#ff4d5e' : p.color;
  const mr = r * (1.4 + near * .6);
  ctx.beginPath(); ctx.ellipse(0, left, mr, mr * .28, 0, 0, Math.PI * 2); ctx.fill();
  const len = p.vy * (big ? .2 : .18);
  const half = r * (big ? .34 : .55);
  ctx.globalAlpha = big ? .2 : .26;
  ctx.fillStyle = big ? '#ff8aa0' : p.color;
  ctx.beginPath(); ctx.moveTo(-half, -r * .4); ctx.lineTo(half, -r * .4); ctx.lineTo(0, -r * .4 - len); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = big ? .45 : .35;
  ctx.strokeStyle = '#fff4fb'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -r * .5); ctx.lineTo(0, -r * .5 - len * .6); ctx.stroke();
  ctx.globalAlpha = big ? .18 : .13;
  ctx.lineWidth = 1;
  const wob = Math.sin(p.age * 18 + p.x) * 2;
  ctx.beginPath();
  ctx.moveTo(-half * .9 + wob, -r - 4); ctx.lineTo(-half * .9 + wob, -r - 4 - len * .35);
  ctx.moveTo(half * .9 - wob, -r - 10); ctx.lineTo(half * .9 - wob, -r - 10 - len * .3);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 喵姆喵姆: the four toes of a paw print, around the pad. Shared by the claw mark and the stamp. */
const PAW_TOES = [[-1, -.55], [-.35, -1], [.35, -1], [1, -.55]] as const;
/** 喵姆喵姆: the two cat ears, x offset and tilt. */
const CAT_EARS = [[-9, -.35], [9, .25]] as const;
/** 蹭热度: viewfinder corners as unit signs (x side, top/bottom). */
const FRAME_CORNERS = [[-1, 0], [1, 0], [-1, 1], [1, 1]] as const;

/** One drumstick centred on the origin, lying along x: a tan shaft, a darker bead at the tip. */
function drumstick(ctx: CanvasRenderingContext2D, len: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
  ctx.strokeStyle = '#d9b884'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
  ctx.fillStyle = '#8a6a44';
  ctx.beginPath(); ctx.ellipse(len / 2, 0, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
}

/** The even-width heart: short blunt tip, full lower arcs — no long tapering point.
    Traced centred at the origin, half-width s. Used by the ult pulse. */
function heartPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, s * .62);
  ctx.bezierCurveTo(-s * .55, s * .38, -s, 0, -s, -s * .35);
  ctx.bezierCurveTo(-s, -s * .72, -s * .62, -s * .95, -s * .3, -s * .95);
  ctx.bezierCurveTo(-s * .12, -s * .95, 0, -s * .82, 0, -s * .68);
  ctx.bezierCurveTo(0, -s * .82, s * .12, -s * .95, s * .3, -s * .95);
  ctx.bezierCurveTo(s * .62, -s * .95, s, -s * .72, s, -s * .35);
  ctx.bezierCurveTo(s, 0, s * .55, s * .38, 0, s * .62);
  ctx.closePath();
}

/** The five-point star: traced centred at the origin, outer radius s, inner radius s*.42,
    point up. Shared by the star rain, the wish, the poppa ring and the dizzy head. */
function starPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? s * .42 : s;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** The while-rooted status effect. Every root shows something at the torso; a character whose
 *  control comes from somewhere else overrides it per data (rootFx, e.g. an ice crystal).
 *  The default is the ult pulse's heart, scaled down — solid, gently breathing. */
export function drawRootFx(ctx: CanvasRenderingContext2D, f: Fighter, time: number): void {
  const bob = Math.sin(time * 4 + f.id * 1.7) * 3;
  ctx.save();
  ctx.translate(f.x, f.y - 105 + bob);
  switch (f.data.rootFx) {
    case 'moca-ring': {
      // 扣一点: a flat ring on the ankles. The parent sits at the torso, so step down to the feet.
      ctx.translate(0, 105 - bob);
      ctx.strokeStyle = f.data.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'stun': {
      // 星之鼓动: three dizzy little stars circle the head instead of the heart.
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 26, sy = Math.sin(a) * 8 - 16;
        const s = 9 + Math.sin(a + 1.2) * 1.5;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a * .8);
        ctx.fillStyle = '#ffd257';
        starPath(ctx, s);
        ctx.fill();
        ctx.strokeStyle = '#b46a1e';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    default: {
      const pulse = 1 + Math.sin(time * 6 + f.id) * .06;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ff5f9e';
      heartPath(ctx, 15);
      ctx.fill();
      ctx.strokeStyle = '#ffd9ec';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** 打气: the declared second meter floats over the fighter's head; full is a colour change only. */
export function drawGauge(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const spec = f.data.gauge;
  if (!spec?.head || f.hp <= 0) return;
  const w = 46;
  const x = Math.round(f.x) - w / 2;
  const y = Math.round(f.y) - 208;
  const k = clamp(f.gauge / spec.max, 0, 1);
  ctx.fillStyle = '#171120aa';
  ctx.fillRect(x - 1, y - 1, w + 2, 6);
  if (k > 0) {
    ctx.fillStyle = k >= 1 ? '#ffffff' : spec.color;
    ctx.fillRect(x, y, Math.max(3, Math.round(w * k)), 4);
  }
}

/** 0..1 pseudo-noise for stateless effect placement. */
const noise01 = (n: number): number => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

/** One rose petal: a body plus a lighter lobe. 友希那用蓝，花道·缠把同一笔改成红。 */
function drawPetal(ctx: CanvasRenderingContext2D, body: string, lobe: string): void {
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lobe;
  ctx.beginPath(); ctx.ellipse(-1.5, -1, 3, 1.4, -.4, 0, Math.PI * 2); ctx.fill();
}

/** 蝶变: cyan leaf wings (fore + hind each side) on a hairline body, about twice a petal.
    `open` is 0 (clapped) to 1 (spread); the flap squeezes the wings toward the body axis. */
function drawButterfly(ctx: CanvasRenderingContext2D, open: number): void {
  ctx.scale(2, 2);
  const leaf = (angle: number, l: number, w: number) => {
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(l * .25, -w * .5, l * .6, -w * 1.25, l, 0);
    ctx.bezierCurveTo(l * .7, w * 1.1, l * .3, w * .8, 0, 0);
    ctx.fill();
  };
  ctx.fillStyle = '#4EDFF9';
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side * Math.max(.08, open), 1);
    ctx.save(); leaf(.45, 4.6, 1.9); ctx.restore();
    leaf(-.5, 7.5, 2.6);
    ctx.translate(2.8, -.6);
    ctx.fillStyle = '#A6F4FF';
    leaf(0, 3.4, 1);
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(0, .4, .7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
}

/** Layer's bass on 燃尽. Places are baked; size 0 hides that phase. */
export function drawLayerBass(ctx: CanvasRenderingContext2D, f: Fighter, images: ImageCache | undefined, alpha: number): void {
  if (alpha <= 0 || f.attack?.skill.fx !== 'burnout') return;
  const clip = clipFor(f);
  if (clip.row > 2) return;
  const place = LAYER_BASS_POSES[clip.row];
  if (place.size <= 0) return;
  const im = images?.get(LAYER_BASS_SRC);
  if (!im?.naturalWidth) return;
  const dw = place.size;
  const dh = dw * (im.naturalHeight / im.naturalWidth);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(f.x, f.hp <= 0 ? FLOOR : f.y);
  ctx.scale(f.facing, 1);
  ctx.translate(place.x, place.y);
  ctx.rotate(place.rot);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = phoneRaster() ? 'low' : 'high';
  ctx.drawImage(keyed(im), -LAYER_BASS_GRIP.x / im.naturalWidth * dw, -LAYER_BASS_GRIP.y / im.naturalHeight * dh, dw, dh);
  ctx.restore();
}

/** 狼王来了: the stage goes dark behind the bodies and a pale-blue moon pillar falls on her.
 *  'back' runs before any body is drawn (the dark veil and the pillar itself); 'front' runs after
 *  them in screen space and only lays a faint wash of moonlight over the lit column. */
export function drawMoonlight(ctx: CanvasRenderingContext2D, e: Effect, pass: 'back' | 'front'): void {
  const t = e.max - e.life;
  const fade = Math.min(1, t / .12) * Math.min(1, e.life / .3);
  if (fade <= 0) return;
  const x = e.x, foot = FLOOR;
  const flick = 1 + Math.sin(t * 23) * .04;
  ctx.save();
  if (pass === 'back') {
    ctx.globalAlpha = fade * .66;
    ctx.fillStyle = '#04061a';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = 'lighter';
  // The pillar: narrow at the sky, opening toward the floor, brightest on its axis.
  const top = 46, bottom = 130;
  const g = ctx.createLinearGradient(x - bottom, 0, x + bottom, 0);
  const core = pass === 'back' ? .34 : .12;
  g.addColorStop(0, 'rgba(120,170,255,0)');
  g.addColorStop(.5, `rgba(170,205,255,${core * fade * flick})`);
  g.addColorStop(1, 'rgba(120,170,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - top, 0); ctx.lineTo(x + top, 0);
  ctx.lineTo(x + bottom, foot); ctx.lineTo(x - bottom, foot);
  ctx.closePath(); ctx.fill();
  if (pass === 'back') {
    // Where the moonlight lands: a soft pool on the floor and a few motes drifting down the beam.
    const pool = ctx.createRadialGradient(x, foot, 4, x, foot, 150);
    pool.addColorStop(0, `rgba(190,215,255,${.45 * fade})`);
    pool.addColorStop(1, 'rgba(190,215,255,0)');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(x, foot, 150, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(225,238,255,${.7 * fade})`;
    for (let i = 0; i < 9; i++) {
      const u = (i * .37 + t * (.35 + (i % 3) * .1)) % 1;
      const mx = x + Math.sin(i * 2.3 + t * 1.7) * (top + (bottom - top) * u) * .6;
      ctx.beginPath(); ctx.arc(mx, u * foot, 1.6 + (i % 2), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/* ---- 琴平凪 tables, built once so the per-frame draws allocate nothing ---- */
/** 打水漂: pip positions per die face, in units of the half-offset from the centre. */
const DIE_PIPS: readonly (readonly (readonly [number, number])[])[] = [
  [],
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
];
/** 稍好一些的地狱: the crumbs of the bitten lollipop. */
const CANDY_CRUMBS = ['#c9785a', '#ffb3c7', '#8b4a33', '#ffd9b8', '#c9785a'] as const;
/** ……来练习吧: the tear gathers this long at the eye, and lands this long before the sea's t0 —
 *  the moment the sea opens. Both effects read these, so they always meet. */
const TEAR_GATHER = .12;
const SEA_LEAD = .03;
/** ……来练习吧: the sea's surface, sampled every SEA_STEP once per frame and reused for the fill, the
 *  line and the foam. Sized for the widest sea any caller asks for (half-width ≤ SEA_MAX_HALF). */
const SEA_STEP = 8;
const SEA_MAX_HALF = 640;
const seaY = new Float32Array(Math.ceil((SEA_MAX_HALF * 2) / SEA_STEP) + 2);
/** ……来练习吧: the surface line's fade, as [from, to, alpha] over |x| / half-width. */
const SEA_LINE_BANDS: readonly (readonly [number, number, number])[] = [[0, .5, .75], [.5, .8, .45], [.8, 1, .18]];

/* ---- 安可是主唱的: the full-screen layers, pre-rendered once ----
   Gradient fills over large areas are the expensive part of these layers, so the static ones are
   drawn once into offscreen canvases and blitted every frame: the dimmed house with its haze and the
   crowd's floor glow. The beams stay polygon fills (a rotated blit samples far slower than a fill);
   only their gradients are cached, per canvas. */
/** Stick endpoints for the crowd, five numbers per head: x, y, unit x, unit y, colour index. */
const CROWD = new Float32Array(32 * 5);
interface EncoreLayers { house: HTMLCanvasElement; glow: HTMLCanvasElement }
let encoreLayers: EncoreLayers | null | undefined;
function layer(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (g) paint(g);
  return cv;
}
/** Built on first use; null where there is no DOM (the headless checks never draw). */
function getEncoreLayers(): EncoreLayers | null {
  if (encoreLayers !== undefined) return encoreLayers;
  if (typeof document === 'undefined') return (encoreLayers = null);
  const house = layer(W, H, g => {
    g.fillStyle = 'rgba(6,4,14,.5)'; g.fillRect(0, 0, W, H);
    const haze = g.createLinearGradient(0, 0, 0, H * .4);
    haze.addColorStop(0, 'rgba(170,140,255,.12)'); haze.addColorStop(1, 'rgba(170,140,255,0)');
    g.fillStyle = haze; g.fillRect(0, 0, W, H * .4);
  });
  const glow = layer(W, 140, g => {
    const g0 = g.createLinearGradient(0, 0, 0, 140);
    g0.addColorStop(0, 'rgba(153,255,153,0)'); g0.addColorStop(1, 'rgba(153,255,153,.45)');
    g.fillStyle = g0; g.fillRect(0, 0, W, 140);
  });
  return (encoreLayers = { house, glow });
}
const beamCache = new WeakMap<CanvasRenderingContext2D, CanvasGradient[]>();
/** The two band-colour beam gradients, top to bottom of the beam, built once per canvas. */
function beamGrads(ctx: CanvasRenderingContext2D): CanvasGradient[] {
  let b = beamCache.get(ctx);
  if (!b) {
    b = ['170,34,238', '119,255,255'].map(rgb => {
      const g0 = ctx.createLinearGradient(0, 0, 0, H * 1.2);
      g0.addColorStop(0, `rgba(${rgb},.3)`); g0.addColorStop(1, `rgba(${rgb},0)`);
      return g0;
    });
    beamCache.set(ctx, b);
  }
  return b;
}

/* ---- 滨崎茉幌 drawing helpers ---- */
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
/** Overshoots a little past 1 and settles: the comic pop-in. */
const backOut = (k: number) => { const c = 1.9; const u = k - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
/** 一肩扛下: the pile on her head, item i's height above the stack base (0 the book, 1 the bass, 2 the mic). */
const BURDEN_STACK = [-5, -18, -40] as const;
/** A jagged comic star path, centred on the origin. */
function jag(ctx: CanvasRenderingContext2D, outer: number, inner: number, spikes: number): void {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rr = i % 2 ? inner : outer * (i % 4 === 0 ? 1 : .82);
    const a = i * Math.PI / spikes;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * .2, x - s * .8, y - s * 1.4, x, y - s * .5);
  ctx.bezierCurveTo(x + s * .8, y - s * 1.4, x + s * 1.6, y - s * .2, x, y + s * .9);
  ctx.fill();
}
/** One half of a broken heart, its crack running down the middle. */
function halfHeart(ctx: CanvasRenderingContext2D, s: number, color: string, left: boolean): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const k = left ? -1 : 1;
  ctx.moveTo(0, s * .9);
  ctx.bezierCurveTo(k * s * 1.6, -s * .2, k * s * .8, -s * 1.4, 0, -s * .5);
  ctx.lineTo(k * s * .2, -s * .1); ctx.lineTo(-k * s * .1, s * .3); ctx.closePath();
  ctx.fill();
}
/** Bold comic lettering with a thick ink edge. */
function comic(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, rot: number): void {
  if (size <= 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `900 ${size}px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * .22); ctx.strokeStyle = '#1a0f08'; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
}
/** The anime anger mark: four red brackets round a point. */
function angerMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (s <= .5) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#ff2f4f'; ctx.lineWidth = Math.max(2, s * .32); ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI / 2 + Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(s * .3, -s * .6); ctx.quadraticCurveTo(s * .3, -s * .3, s * .6, -s * .3); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function note(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 5, 3.6, -.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + 4, y - 1); ctx.lineTo(x + 4, y - 18); ctx.lineTo(x + 11, y - 13); ctx.stroke();
}
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** 绝不退场: the anime blush hatch on a struck cheek — three short slanted red strokes, nothing more.
 *  Centred on (x, y); `dir` is the way she faces. */
function blush(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, dir: number): void {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * k, k);
  ctx.strokeStyle = '#ff4f6a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 5, 4); ctx.lineTo(-2 + i * 5, -4); ctx.stroke(); }
  ctx.restore();
}

/** 一肩扛下: 0 the lyric book (flat, the base), 1 the bass (lying across), 2 the mic (standing on top).
 *  Ink-outlined, a light rim in the band colour so the pile reads against any backdrop. */
function drawBurdenItem(ctx: CanvasRenderingContext2D, i: number, color: string): void {
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#151222'; ctx.lineJoin = 'round';
  if (i === 0) {
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(-20, -5, 40, 10); ctx.strokeRect(-20, -5, 40, 10);
    ctx.fillStyle = color; ctx.fillRect(-20, -5, 6, 10);
    ctx.strokeStyle = '#9ab6d8'; ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(-10, -1 + k * 3); ctx.lineTo(16, -1 + k * 3); ctx.stroke(); }
  } else if (i === 1) {
    ctx.fillStyle = '#c9a26b';
    ctx.fillRect(4, -3, 34, 5); ctx.strokeRect(4, -3, 34, 5);
    ctx.fillStyle = '#3b3550'; ctx.fillRect(36, -5, 8, 9); ctx.strokeRect(36, -5, 8, 9);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(-12, 0, 18, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-16, -2, 8, 3);
  } else {
    ctx.fillStyle = '#e8e6f2';
    ctx.beginPath(); ctx.moveTo(-3, 18); ctx.lineTo(3, 18); ctx.lineTo(4, 0); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3b3550';
    ctx.beginPath(); ctx.arc(0, -7, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -7, 5, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
  }
}

export function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, images?: ImageCache): void {
  // 丰川祥子 keeps her whole visual language in one module.
  if (drawSakikoFx(ctx, e, liteFx)) return;
  const p = 1 - e.life / e.max, r = e.radius ?? 50;
  const square = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.save();
  ctx.globalAlpha = Math.min(1, e.life * 6);
  ctx.fillStyle = e.color;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 4;
  switch (e.type) {
    case 'dust':
      ctx.globalAlpha = (1 - p) * .7;
      { const width = r * (.2 + p); ctx.strokeRect(e.x - width, e.y - 8 - p * 28, width * 2, 10 + p * 20); }
      break;
    case 'shield':
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r * .43, r, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .12; ctx.fill();
      break;
    case 'parry': {
      // 完美格挡: the guard ellipse flares bright, and one faint copy swells outward and fades.
      const fade = 1 - p;
      ctx.fillStyle = '#e9fbff';
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = fade * .5;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r * .43, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.lineWidth = 4;
      ctx.stroke();
      const s = 1 + p * .5;
      ctx.strokeStyle = e.color;
      ctx.fillStyle = e.color;
      ctx.globalAlpha = fade * .45;
      ctx.lineWidth = 2 + fade * 4;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r * .43 * s, r * s, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = fade * .14; ctx.fill();
      break;
    }
    case 'hit':
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); square(r * .2 + p * r * .5, -3, r * (1 - p), 6); }
      ctx.fillStyle = '#fffbea'; square(-8, -8, 16, 16);
      break;
    case 'slash':
      ctx.translate(e.x, e.y); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 9 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-22, 12, r * (.8 + p * .4), -1.5, .7); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'iaido':
    case 'bushido': {
      // 剑道三连: the wooden cut. A crescent blade trail sweeps the arc while two dim
      // afterimages lag behind a white-hot leading edge — a cheap motion streak, no shadow/filter.
      const heavy = e.type === 'bushido';
      const cx = -10, cy = 4;
      const a0 = -1.36, a1 = .86;
      const R = r * (heavy ? .82 : .74);
      const lead = a0 + (a1 - a0) * Math.min(1, p * 1.22);
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.lineCap = 'round';
      // trailing afterimages, farthest behind first
      const ghosts = liteFx ? 1 : 3;
      for (let i = ghosts; i >= 1; i--) {
        const to = lead - i * (a1 - a0) * .2;
        if (to <= a0 + .05) continue;
        ctx.globalAlpha = (1 - p) * (heavy ? .34 : .3) * (1 - i * .22);
        ctx.fillStyle = i === 1 ? '#e7dbff' : '#b79bff';
        arcBladePath(ctx, cx, cy, R, a0, to, (heavy ? 12 : 9) * (1 - i * .18));
        ctx.fill();
      }
      // the blade: violet edge, near-white body
      ctx.globalAlpha = Math.min(1, (1 - p) * 1.2);
      arcBladePath(ctx, cx, cy, R, a0, lead, heavy ? 15 : 11);
      ctx.fillStyle = '#cdb8ff';
      ctx.fill();
      arcBladePath(ctx, cx, cy, R - 1, a0, lead, heavy ? 8 : 6);
      ctx.fillStyle = '#f5f0ff';
      ctx.fill();
      // white-hot core riding the lit edge of the blade
      ctx.globalAlpha = (1 - p) * .95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = (heavy ? 5 : 3.5) * (1 - p * .5) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, a0, lead); ctx.stroke();
      // sparks flicking off the tip
      const tx = cx + Math.cos(lead) * R, ty = cy + Math.sin(lead) * R;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const d = 3 + p * (12 + i * 10), a = lead + (i - 1) * .5;
        ctx.globalAlpha = (1 - p) * (i ? .6 : .95);
        ctx.beginPath(); ctx.arc(tx + Math.cos(a) * d, ty + Math.sin(a) * d, Math.max(1.2, 3.2 * (1 - p) - i * .5), 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'tea':
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#f4e2b8';
      ctx.beginPath(); ctx.ellipse(0, 4, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = (1 - p) * .7;
      ctx.beginPath(); ctx.arc(0, -6, 8 + p * 12, Math.PI, 0); ctx.stroke();
      break;
    case 'cloak': {
      // 忍法·隐身术: a smoke bomb swallows her — billows burst outward and thin away as she fades.
      ctx.translate(e.x, e.y);
      const burst = 1 - Math.pow(1 - p, 2.5);
      const fade = Math.pow(1 - p, 1.3);
      const grad = smokeGrad(ctx);
      // dense core right as it pops, then billows take over
      if (p < .3) {
        ctx.globalAlpha = (1 - p / .3) * .8;
        ctx.save();
        ctx.scale(r * .72, r * .72);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      const n = liteFx ? 9 : 18;
      const frac = (x: number) => x - Math.floor(x);
      for (let i = 0; i < n; i++) {
        const h1 = frac(Math.sin(i * 12.9898) * 43758.5453);
        const h2 = frac(Math.sin(i * 78.233) * 12543.21);
        const h3 = frac(Math.sin(i * 37.719) * 9871.13);
        const a = i * 2.399 + .4;
        const dist = r * (.08 + h1 * .68) * (.5 + burst * .85);
        const size = r * (.18 + h2 * .28) * (.6 + burst * .95);
        ctx.save();
        ctx.translate(Math.cos(a) * dist, Math.sin(a) * dist * .72 - p * (12 + h3 * 24));
        ctx.rotate(a + h1 * 1.6);
        ctx.scale(size, size);
        ctx.globalAlpha = fade * (.3 + h3 * .34);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, 1 + h2 * .35, .7 + h3 * .35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // the seal flashes white for the first instant
      if (p < .38) {
        ctx.globalAlpha = (1 - p / .38) * .85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r * (.4 + p * 1.6), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'slow-bubble': {
      const t = e.age ?? 0;
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#e8fff8';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-6, 10);
      ctx.lineTo(-2, 18);
      ctx.lineTo(4, 10);
      ctx.fillStyle = '#e8fff8';
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = Math.floor(t * 3) % 3 === i ? 1 : .35;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(-8 + i * 8, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'bass-burst': {
      // 燃尽: small red blocks flying out of the bass body where it lands.
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#CC0000';
      const n = 12;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const dist = 4 + p * r;
        const w = Math.max(4, 18 * (1 - p * .4));
        const h = Math.max(3, 9 * (1 - p * .35));
        ctx.save();
        ctx.translate(Math.cos(ang) * dist, Math.sin(ang) * dist);
        ctx.rotate(ang);
        square(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      break;
    }
    case 'shove':
    case 'grab':
      ctx.translate(e.x, e.y);
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (.5 + p * .6), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * (.2 + p * .4), 0, Math.PI * 2); ctx.stroke();
      break;
    case 'upper':
      // Rising streak: a slash rotated to point up, trailing below.
      ctx.translate(e.x - (e.dir ?? 1) * 30, e.y - 20); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 8 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-10, 30, r * (.9 + p * .5), -2.6, -1.0); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'sweep':
      // Low, wide arc hugging the floor.
      ctx.translate(e.x - (e.dir ?? 1) * 40, e.y); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 7 * (1 - p) + 2;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + p * .3), r * .28, 0, -.4, .9); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 2; ctx.stroke();
      break;
    case 'launch':
      // Stack of chevrons climbing out of the impact point.
      ctx.translate(e.x, e.y); ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const y = -p * 70 - i * 18;
        ctx.beginPath(); ctx.moveTo(-14, y + 10); ctx.lineTo(0, y); ctx.lineTo(14, y + 10); ctx.stroke();
      }
      break;
    case 'crescent':
      // Rising moon-arc. The inner stroke is the lit edge of the blade.
      ctx.translate(e.x - (e.dir ?? 1) * 16, e.y + 16); ctx.scale(e.dir ?? 1, 1);
      ctx.lineWidth = 8 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-6, 18, r * (.9 + p * .35), -2.55, -.3); ctx.stroke();
      ctx.strokeStyle = '#fff7de'; ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'drums': {
      ctx.translate(e.x, e.y); ctx.scale(e.dir ?? 1, 1);
      const im = images?.get(KIT_SRC);
      const w = 360, h = 180;
      // Image center is the bass drum. The old -110 offset was the side-view seat gap.
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -w / 2, -h + 32, w, h);
      }
      else {
        ctx.beginPath(); ctx.arc(48, -40, 28, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, -78, 16, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    // 双踩地狱: the first thing off is her own mask — a white half-mask, purple trim, tossed up and back, spinning.
    case 'mask-off': {
      const dir = e.dir ?? 1;
      const k = p;
      ctx.translate(e.x - dir * 120 * k, e.y - 110 * Math.sin(Math.min(1, k * 1.3) * Math.PI * .5) + 150 * k * k);
      ctx.rotate(-dir * k * 7.5);
      ctx.globalAlpha = Math.min(1, e.life / .25);
      ctx.scale(dir, 1);
      const w = 30, h = 13;
      ctx.beginPath();
      ctx.moveTo(-w, -h * .2);
      ctx.bezierCurveTo(-w * .9, -h * 1.5, -w * .25, -h * 1.1, 0, -h * .45);
      ctx.bezierCurveTo(w * .25, -h * 1.1, w * .9, -h * 1.5, w, -h * .2);
      ctx.bezierCurveTo(w * .85, h * .9, w * .3, h * 1.05, 0, h * .3);
      ctx.bezierCurveTo(-w * .3, h * 1.05, -w * .85, h * .9, -w, -h * .2);
      ctx.closePath();
      ctx.fillStyle = '#f7f2ff'; ctx.fill();
      ctx.strokeStyle = '#7a3a8a'; ctx.lineWidth = 2.4; ctx.stroke();
      // Eye holes, and the moth-orchid swirl over one of them (Amoris).
      ctx.fillStyle = '#1d1426';
      ctx.beginPath(); ctx.ellipse(-w * .45, -h * .1, w * .2, h * .32, .15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(w * .45, -h * .1, w * .2, h * .32, -.15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c86bd6'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(w * .45, -h * .1, w * .32, -2.6, -.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(w * .62, -h * .55, 4, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    // 双踩地狱 rain: a note meets the floor — a flat ring opens on the ground and a few drops jump and fall
    // back. The big notes splash wider.
    case 'rain-splash': {
      const big = !!e.heavy;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .85;
      ctx.save(); ctx.scale(1, .26);
      ctx.strokeStyle = big ? '#ff8aa0' : e.color; ctx.lineWidth = big ? 5 : 3.5;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.2 + easeOut(p) * (big ? 3.2 : 2.4)), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff4fb';
      const drops = big ? 6 : 4;
      for (let i = 0; i < drops; i++) {
        const side = (i / (drops - 1)) * 2 - 1;
        const vx = side * (big ? 70 : 50), vy = -(big ? 150 : 110) * (1 - Math.abs(side) * .35);
        const t = p * e.max;
        const x = vx * t, y = vy * t + 520 * t * t;
        if (y > 2) continue;
        ctx.beginPath(); ctx.arc(x, y, big ? 2.4 : 1.8, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    // 麦子越踩越坚强: small on purpose — a hint of a field, not a botanical drawing. A low band of warm light
    // opens on the floor; a row of tiny ears (a hair-thin stem, three grains and a tip) springs up from the
    // middle outward, and a gust runs through them from one side to the other like wind over a field.
    // Then the ears let go of their grains, which drift up as gold motes, and the row sinks away.
    case 'wheat-rise': {
      const t = e.max - e.life;
      const fade = Math.min(1, e.life / .45);
      ctx.translate(e.x, e.y);
      // The floor glow: one radial gradient, squashed flat.
      ctx.save();
      ctx.scale(1, .18);
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.25);
      glow.addColorStop(0, 'rgba(255,214,110,.55)');
      glow.addColorStop(1, 'rgba(255,214,110,0)');
      ctx.globalAlpha = fade * Math.min(1, t / .15);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const N = 11;
      const sink = Math.max(0, (t - (e.max - .45)) / .45);
      ctx.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1) * 2 - 1;
        const x0 = u * r * .8;
        const grow = Math.min(1, Math.max(0, (t - Math.abs(u) * .14) / .18));
        if (grow <= 0) continue;
        const h = (13 + ((i * 5) % 4) * 3) * easeOut(grow) * (1 - sink * .7);
        // The gust: a lean that travels across the row.
        const lean = Math.sin(t * 7 - u * 3.2) * .32 + .08;
        const tipX = x0 + Math.sin(lean) * h, tipY = -Math.cos(lean) * h;
        ctx.globalAlpha = fade * (.55 + .45 * grow);
        ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0, -h * .55, tipX, tipY); ctx.stroke();
        // Three grains and a tip along the last few pixels, leaning with the stem.
        ctx.fillStyle = '#ffe08a';
        for (let k = 0; k < 3; k++) {
          const d = 2 + k * 2.6;
          const gx = tipX - Math.sin(lean) * d, gy = tipY + Math.cos(lean) * d;
          const side = k % 2 ? 1 : -1;
          ctx.beginPath(); ctx.ellipse(gx + side * 1.3, gy, 1.3, 2, lean + side * .5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(tipX, tipY - 1, 1.1, 0, Math.PI * 2); ctx.fill();
        // Late on, two grains blow off each ear and rise.
        if (t > .55) {
          const q = Math.min(1, (t - .55 - (i % 3) * .05) / .6);
          if (q > 0) {
            ctx.fillStyle = '#fff2c4';
            for (let k = 0; k < 2; k++) {
              ctx.globalAlpha = fade * (1 - q) * .95;
              const mx = tipX + (k ? 1 : -1) * 4 * q + Math.sin(q * 6 + i) * 3;
              ctx.beginPath(); ctx.arc(mx, tipY - q * (40 + k * 26 + (i % 4) * 8), 1.3, 0, Math.PI * 2); ctx.fill();
            }
          }
        }
      }
      break;
    }
    // 麦子越踩越坚强, held: a soft gold ring at her feet and two motes circling up while the cut lasts.
    case 'wheat-aura': {
      const t = e.age ?? 0;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = e.life * .7;
      ctx.save(); ctx.scale(1, .25);
      ctx.strokeStyle = e.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 34 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fff2c4';
      for (let i = 0; i < 2; i++) {
        const u = (t * .8 + i * .5) % 1;
        const a0 = t * 4 + i * Math.PI;
        ctx.globalAlpha = e.life * (1 - u) * .9;
        ctx.beginPath(); ctx.arc(Math.cos(a0) * 26, -10 - u * 150, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    // 双踩地狱: two stage beams from the top corners cross on her — 武道馆 again. They sway slowly; when the
    // big last wave comes (n = 1) they go red.
    case 'stage-lights': {
      const t = e.max - e.life;
      const red = (e.n ?? 0) > 0;
      ctx.globalAlpha = Math.min(1, t / .25) * Math.min(1, e.life / .3);
      for (const side of [-1, 1]) {
        const sway = Math.sin(t * 1.4 + side) * 40;
        const topX = e.x + side * 330, topW = 14;
        const footX = e.x + sway * side * .5, footW = 90;
        const g = ctx.createLinearGradient(topX, 0, footX, e.y);
        g.addColorStop(0, red ? 'rgba(255,90,110,.42)' : 'rgba(214,150,255,.38)');
        g.addColorStop(1, red ? 'rgba(255,90,110,0)' : 'rgba(214,150,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(topX - topW, -10); ctx.lineTo(topX + topW, -10);
        ctx.lineTo(footX + footW, e.y); ctx.lineTo(footX - footW, e.y);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    // 双踩地狱: every repel pulse is a double-kick — a flat ring rolls out along the floor and fire licks
    // up under her feet (「双踩脚底冒火」).
    case 'kick-wave': {
      ctx.translate(e.x, e.y);
      ctx.save();
      ctx.scale(1, .2);
      for (let i = 0; i < 2; i++) {
        const k = Math.max(0, p - i * .18) / (1 - i * .18);
        if (k <= 0) continue;
        ctx.globalAlpha = (1 - k) * (i ? .45 : .8);
        ctx.strokeStyle = i ? '#ffd0ef' : e.color; ctx.lineWidth = i ? 6 : 10;
        ctx.beginPath(); ctx.arc(0, 0, 20 + r * easeOut(k), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      if (p < .7) {
        const fade = 1 - p / .7;
        for (let i = 0; i < 7; i++) {
          const fx0 = (i - 3) * 15;
          const hgt = (26 + ((i * 7) % 3) * 9) * (.6 + .4 * Math.sin(p * 20 + i)) * fade;
          const grad = ctx.createLinearGradient(0, 0, 0, -hgt);
          grad.addColorStop(0, 'rgba(255,90,58,.9)');
          grad.addColorStop(.6, 'rgba(255,179,71,.75)');
          grad.addColorStop(1, 'rgba(255,240,180,0)');
          ctx.globalAlpha = fade;
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.moveTo(fx0 - 8, 0);
          ctx.quadraticCurveTo(fx0 - 7, -hgt * .55, fx0 + Math.sin(p * 30 + i) * 4, -hgt);
          ctx.quadraticCurveTo(fx0 + 7, -hgt * .55, fx0 + 8, 0);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    // 双踩地狱: the second wave opens on a crash cymbal — a gold disc flashes and throws a ring of short rays.
    case 'crash-cymbal': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - p;
      ctx.save(); ctx.scale(1, .32);
      ctx.fillStyle = '#e0b84a';
      ctx.beginPath(); ctx.arc(0, 0, 34 * (1 + p * .15), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = e.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const ang = i * Math.PI / 5;
        const r0 = 30 + p * r * .6, r1 = r0 + 14 * (1 - p);
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0 * .5); ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1 * .5); ctx.stroke();
      }
      break;
    }
    // 打鼓打似了: a drumstick spins up out of the hand and drops away.
    case 'stick-fly': {
      const dir = e.dir ?? 1;
      ctx.translate(e.x + dir * 150 * p, e.y - 240 * p + 300 * p * p);
      ctx.rotate(dir * p * 14);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      drumstick(ctx, 46);
      break;
    }
    // 左右开弓: one beat landing — a comic impact star with the drum's own sound in it, 咚 and 哒 in turn
    // (left hand, right hand). It grows and heats up with the tempo: white, then gold, then red. A beat
    // that only finds air is a small grey puff.
    case 'stick-tap': {
      const n = e.n ?? 0;
      const heat = Math.min(1, n / 11);
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      if (!e.hit) {
        ctx.globalAlpha = (1 - p) * .6;
        ctx.strokeStyle = '#d8d0e4'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6 + p * 12, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      const k = backOut(Math.min(1, t / .06));
      const R = (20 + heat * 14) * k;
      ctx.rotate((n % 2 ? -1 : 1) * .2);
      ctx.globalAlpha = Math.min(1, e.life / .08);
      const fill = heat < .5 ? '#ffffff' : heat < .85 ? '#ffe28a' : '#ff8a6a';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const rr = i % 2 ? R * .52 : R * (i % 4 ? .92 : 1.12);
        const ang = i * Math.PI / 8;
        if (i) ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else ctx.moveTo(rr, 0);
      }
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.font = `900 ${Math.round(R * .9)}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = e.color;
      ctx.fillText(n % 2 ? '哒' : '咚', 0, 1);
      break;
    }
    // 左右开弓: the swing itself — a short arc from over her shoulder down onto the head, one hand at a time:
    // purple for one side, pink for the other. Thicker as the tempo climbs.
    case 'roll-swoosh': {
      const dir = e.dir ?? 1;
      const n = e.n ?? 0;
      const heat = Math.min(1, n / 11);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = (1 - p) * .8;
      const tx = e.tx ?? 60, ty = e.ty ?? 40;
      // A filled crescent: the outer edge bows up and over, the inner edge cuts back a little lower, so the
      // stroke tapers to a point at both ends. The control point sits above the impact.
      const cx = tx * .55, cy = Math.min(0, ty) - 46 - heat * 10;
      const thick = 10 + heat * 8;
      ctx.fillStyle = n % 2 ? '#ff7ab6' : e.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.quadraticCurveTo(cx + 6, cy + thick, 0, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke();
      break;
    }
    // 左右开弓: the metronome over her head. Each beat pops the new number; the last one runs red.
    case 'stick-bpm': {
      const t = e.max - e.life;
      const k = backOut(Math.min(1, t / .07));
      ctx.translate(e.x, e.y);
      ctx.scale(k, k);
      ctx.globalAlpha = Math.min(1, e.life / .08);
      ctx.font = `900 15px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const text = `${e.n ?? 120} BPM`;
      ctx.lineWidth = 4; ctx.strokeStyle = '#1b1424'; ctx.strokeText(text, 0, 0);
      const bpm = e.n ?? 120;
      ctx.fillStyle = e.hit ? '#ff6b6b' : bpm >= 200 ? '#ffb15a' : bpm >= 160 ? '#ffe28a' : '#ffffff'; ctx.fillText(text, 0, 0);
      break;
    }
    // 蹭热度: the selfie flash at the tip of the stick.
    case 'selfie-flash': {
      ctx.translate(e.x, e.y);
      const bloom = ctx.createRadialGradient(0, 0, 2, 0, 0, r * (.6 + p * .6));
      bloom.addColorStop(0, 'rgba(255,255,255,.95)');
      bloom.addColorStop(.4, 'rgba(255,240,250,.5)');
      bloom.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(0, 0, r * (.6 + p * .6), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2 + .3;
        ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 6, Math.sin(ang) * 6); ctx.lineTo(Math.cos(ang) * (14 + p * 26), Math.sin(ang) * (14 + p * 26)); ctx.stroke();
      }
      break;
    }
    // 蹭热度: her live window over her head. The counter rolls up a 万 per 气 she borrowed; with nothing to
    // borrow it sits on 0 and the window goes grey (「喵梦怎么一点热度都没有」).
    case 'selfie-live': {
      // The window opens once the photo has flown up into it (t0). How much she borrowed sets the mood:
      // under 20万 a plain counter; 20万+ pink with more hearts; 30万+ gold, a bigger number, a 热门 tag and
      // a burst of rays as the count lands. Nothing borrowed: the window goes grey on 0.
      const t = e.max - e.life - (e.t0 ?? 0);
      if (t < 0) break;
      const n = e.n ?? 0;
      const tier = !e.hit ? -1 : n >= 30 ? 2 : n >= 20 ? 1 : 0;
      const roll = Math.min(1, t / .6);
      const landed = t >= .6;
      const bump = landed && tier >= 1 ? 1 + Math.max(0, 1 - (t - .6) / .18) * (tier === 2 ? .22 : .12) : 1;
      const k = backOut(Math.min(1, t / .12)) * bump;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .25);
      if (tier === 2 && landed && t < 1.05) {
        // The rays behind the window when a big count lands.
        const q = (t - .6) / .45;
        ctx.save();
        ctx.globalAlpha *= (1 - q) * .8;
        ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (let i = 0; i < 12; i++) {
          const ang = i * Math.PI / 6 + .2;
          const r0 = 42 + q * 18, r1 = r0 + 14 + (i % 2) * 8;
          ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0 * .75); ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1 * .75); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.scale(k, k);
      const dead = tier < 0 && t > .45;
      const w = 76, h = 46;
      const edge = dead ? '#8a8494' : tier === 2 ? '#ffd36a' : tier === 1 ? '#ff8fc8' : e.color;
      ctx.fillStyle = dead ? '#2a2830' : '#1b1424';
      ctx.strokeStyle = edge; ctx.lineWidth = tier === 2 ? 4 : 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 9); else ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = dead ? '#77737f' : '#ff4d5e';
      ctx.beginPath(); ctx.arc(-w / 2 + 9, -h / 2 + 9, 3, 0, Math.PI * 2); ctx.fill();
      ctx.font = `800 8px ${UI_FONT}`;
      ctx.fillText('LIVE', -w / 2 + 15, -h / 2 + 9.5);
      const shown = n > 0 ? Math.round(n * roll) : 0;
      ctx.textAlign = 'center';
      ctx.font = `900 ${tier === 2 ? 20 : tier === 1 ? 18 : 17}px ${UI_FONT}`;
      ctx.fillStyle = dead ? '#9b97a6' : tier === 2 && landed ? '#ffd36a' : tier === 1 && landed ? '#ffd6ec' : '#ffffff';
      ctx.fillText(shown > 0 ? `${shown}万` : '0', 0, 3);
      ctx.font = `700 8px ${UI_FONT}`;
      ctx.fillStyle = dead ? '#77737f' : '#e8c8f0';
      ctx.fillText('播放', 0, h / 2 - 8);
      if (tier === 2 && landed) {
        // 热门: a small red tag on the corner.
        ctx.save();
        ctx.translate(w / 2 - 6, -h / 2 - 2);
        ctx.rotate(.18);
        ctx.fillStyle = '#ff4d5e';
        ctx.fillRect(-14, -7, 28, 13);
        ctx.font = `900 9px ${UI_FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('热门', 0, 0);
        ctx.restore();
      }
      if (tier >= 0 && t < 1) {
        // Little hearts float up off the counter while it rolls: two, four or six by the tier.
        const count = 2 + tier * 2;
        ctx.fillStyle = tier === 2 ? '#ffb347' : '#ff6f9e';
        for (let i = 0; i < count; i++) {
          const u = (t * 1.6 + i / count) % 1;
          ctx.save(); ctx.globalAlpha *= (1 - u) * Math.min(1, (1 - t) * 3);
          ctx.translate(w / 2 - 8 - (i % 3) * 10 - (i > 2 ? 30 : 0), -h / 2 - u * 26);
          heartPath(ctx, 4 + (i % 2)); ctx.fill();
          ctx.restore();
        }
      }
      break;
    }
    // 喵姆喵姆: paws at her cheeks — a little spray of purple hearts rolls forward to the heart's reach.
    case 'paw-charm': {
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      for (let i = 0; i < 5; i++) {
        const u = Math.max(0, Math.min(1, (p - i * .06) / .8));
        if (u <= 0) continue;
        const ang = (i - 2) * .22;
        const d = easeOut(u) * (r - 20);
        ctx.save();
        ctx.globalAlpha = (1 - u) * .95;
        ctx.translate(Math.cos(ang) * d, Math.sin(ang) * d + Math.sin(u * 9 + i) * 4);
        const sz = 7 + (i % 2) * 3;
        ctx.fillStyle = i % 2 ? '#ff8fd0' : e.color;
        heartPath(ctx, sz); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
      break;
    }
    // 喵姆喵姆: charmed — a purple heart beats over their head for as long as the charm holds.
    case 'paw-heart': {
      const t = e.max - e.life;
      const beat = 1 + Math.max(0, Math.sin(t * 14)) * .14;
      ctx.translate(e.x, e.y - Math.min(1, t / .15) * 6);
      ctx.scale(backOut(Math.min(1, t / .12)) * beat, backOut(Math.min(1, t / .12)) * beat);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.fillStyle = e.color; heartPath(ctx, 13); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#f6d8ff'; ctx.beginPath(); ctx.arc(-5, -6, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    // 喵姆喵姆 on 要乐奈: she gets a cat teaser dangled over her instead — the stick, the string, a bobbing pompom.
    case 'cat-teaser': {
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .2) * Math.min(1, t / .1);
      const sway = Math.sin(t * 8) * .35;
      ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-34, -26); ctx.lineTo(0, -16); ctx.stroke();
      const bx = Math.sin(sway) * 22, by = Math.cos(sway) * 22 - 16;
      ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = e.color;
      for (let i = 0; i < 7; i++) {
        const ang = i * Math.PI * 2 / 7 + t * 3;
        ctx.beginPath(); ctx.arc(bx + Math.cos(ang) * 5, by + Math.sin(ang) * 5, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx - 2, by - 2, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    // 喵姆喵姆: one paw — three purple claw marks raked across, left and right in turn; the last is twice the size.
    case 'paw-claw': {
      const dir = e.dir ?? 1;
      const big = e.heavy ? 1.9 : 1.25;
      const draw = Math.min(1, p / .35);
      ctx.translate(e.x, e.y);
      ctx.scale(dir * big, big);
      ctx.rotate(.55);
      ctx.globalAlpha = p < .35 ? 1 : 1 - (p - .35) / .65;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const y = i * 9;
        const x0 = -24, x1 = -24 + 48 * draw;
        ctx.strokeStyle = e.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.quadraticCurveTo((x0 + x1) / 2, y + 5, x1, y - 4); ctx.stroke();
        ctx.strokeStyle = '#fbe9ff'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.quadraticCurveTo((x0 + x1) / 2, y + 5, x1, y - 4); ctx.stroke();
      }
      if (e.hit && p < .5) {
        // A paw print where it landed.
        ctx.rotate(-.55);
        ctx.globalAlpha = (1 - p / .5) * .85;
        ctx.fillStyle = '#ffd6f4';
        ctx.beginPath(); ctx.ellipse(0, 4, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
        for (const [tx, ty] of PAW_TOES) { ctx.beginPath(); ctx.arc(tx * 7, -4 + (ty + .55) * 9, 2.4, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    // 蹭热度: the viewfinder. The phone is up on the stick (tx, ty from the centre of the frame); thin lines
    // run from it to the frame's top corners so it reads as the camera looking down at the two of them.
    // Corner brackets snap in round both bodies, a focus square shrinks onto them, and the REC dot blinks.
    case 'selfie-frame': {
      const t = e.max - e.life;
      const hw = e.radius ?? 80, top = -190, bottom = 6;
      const k = backOut(Math.min(1, t / .1));
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .06);
      const px = e.tx ?? 0, py = e.ty ?? -170;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(-hw * k, top * k);
      ctx.moveTo(px, py); ctx.lineTo(hw * k, top * k);
      ctx.stroke();
      ctx.setLineDash([]);
      const w = hw * (1.25 - .25 * k), h0 = top * (1.25 - .25 * k);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'square';
      const L = 18;
      for (const [side, low] of FRAME_CORNERS) {
        const x = side * w, y = low ? bottom : h0, sx = -side, sy = low ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L); ctx.stroke();
      }
      const f = Math.max(0, 1 - t / .25);
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      // The focus square closes onto their faces.
      const fw = 30 + f * 34;
      ctx.strokeRect(-fw, -150 - fw * .55, fw * 2, fw * 1.1);
      if (Math.floor(t * 6) % 2 === 0) {
        ctx.fillStyle = '#ff4d5e';
        ctx.beginPath(); ctx.arc(-w + 14, h0 + 16, 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    // 蹭热度: the shot, as a polaroid. It pops out of the frame, tilts, and flies up into the live window over
    // her head (tx, ty from the start). Inside: two little heads — hers in her colour, theirs in white — and a
    // heart sticker. With nothing borrowed (hit unset) the photo comes out grey.
    case 'selfie-photo': {
      const t = e.max - e.life;
      const fly = Math.min(1, Math.max(0, (t - .12) / .3));
      const ease = fly * fly * (3 - 2 * fly);
      const tx = e.tx ?? 0, ty = e.ty ?? -120;
      ctx.translate(e.x + tx * ease, e.y + ty * ease - Math.sin(ease * Math.PI) * 30);
      const pop = backOut(Math.min(1, t / .12));
      const sc = pop * (1 - ease * .65);
      ctx.rotate((e.dir ?? 1) * (-.12 + ease * .5));
      ctx.scale(sc, sc);
      ctx.globalAlpha = 1 - Math.max(0, (t - .42) / Math.max(.01, e.max - .42));
      const dead = !e.hit;
      ctx.fillStyle = '#fbf8f2';
      ctx.fillRect(-34, -38, 68, 80);
      ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2; ctx.strokeRect(-34, -38, 68, 80);
      ctx.fillStyle = dead ? '#6e6a78' : '#2b2040';
      ctx.fillRect(-28, -32, 56, 54);
      ctx.fillStyle = dead ? '#a9a5b2' : e.color;
      ctx.beginPath(); ctx.arc(-11, -6, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-21, 6, 20, 16);
      ctx.fillStyle = dead ? '#8e8a98' : '#f2eef8';
      ctx.beginPath(); ctx.arc(12, -3, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(3, 8, 18, 14);
      if (!dead) {
        ctx.fillStyle = '#ff6f9e';
        ctx.save(); ctx.translate(18, -22); heartPath(ctx, 6); ctx.fill(); ctx.restore();
      }
      break;
    }
    // 喵姆喵姆: for the whole move she wears cat ears and a tail. The script moves the anchor to the head and
    // the hip of whichever cell is up (ox/oy are the head, tx/ty the hip, both from the fighter origin).
    case 'cat-ears': {
      const dir = e.dir ?? 1;
      // t0 is the move's own clock, written every frame by the script; the life is topped up every frame,
      // so the ears fade out a beat after the move stops, however it stops.
      const t = e.t0 ?? 0;
      ctx.globalAlpha = Math.min(1, t / .08) * Math.min(1, e.life / .06);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.fillStyle = e.color; ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 2;
      for (const [x, tilt] of CAT_EARS) {
        ctx.save(); ctx.translate(x, 0); ctx.rotate(tilt + Math.sin(t * 9 + x) * .06);
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(0, -17); ctx.lineTo(8, 2); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffc6e6';
        ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(0, -10); ctx.lineTo(4, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = e.color;
        ctx.restore();
      }
      // The tail, from the hip (tx, ty from the head, facing-local), swishing.
      ctx.translate(e.tx ?? -10, e.ty ?? 70);
      const sw = Math.sin(t * 7) * .5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a1830'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-26, 4, -40, -22 + sw * 10, -30 + sw * 14, -46);
      ctx.stroke();
      ctx.strokeStyle = e.color; ctx.lineWidth = 6;
      ctx.stroke();
      break;
    }
    // 喵姆喵姆: where a paw lands it leaves a big pink paw print — pad and four toes — that pops and fades.
    // The last one is twice the size.
    case 'paw-print': {
      const t = e.max - e.life;
      const big = e.heavy ? 1.9 : 1;
      const k = backOut(Math.min(1, t / .08)) * big;
      ctx.translate(e.x, e.y);
      ctx.rotate((e.dir ?? 1) * .3);
      ctx.scale(k, k);
      ctx.globalAlpha = Math.min(1, e.life / .15) * .9;
      ctx.fillStyle = '#ffd6f4'; ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 5, 11, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const [x, y] of PAW_TOES) {
        ctx.beginPath(); ctx.ellipse(x * 12, -7 + (y + .55) * 13.3, 4, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      break;
    }
    // 寿来: the ground circle locks the spot through the wind-up.
    case 'lifedraw-mark': {
      const k = 1 - e.life / e.max;
      const r = (e.radius ?? 110) * (1 - k * .12);
      ctx.translate(e.x, e.y);
      ctx.scale(1, .34);
      ctx.rotate((e.max - e.life) * 2.2);
      ctx.globalAlpha *= .9;
      ctx.strokeStyle = '#8dffc0';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#b8ffd8';
      ctx.globalAlpha *= .5 + k * .7;
      ctx.beginPath(); ctx.arc(0, 0, r * k, 0, Math.PI * 2); ctx.fill();
      break;
    }
    // 寿来: the burst is one white-green blast from the circled spot.
    case 'lifedraw-burst': {
      const r = e.radius ?? 110;
      ctx.translate(e.x, e.y);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      glow.addColorStop(0, `rgba(255,255,255,${.9 * Math.max(0, 1 - p * 1.6)})`);
      glow.addColorStop(.45, `rgba(170,255,210,${.55 * Math.max(0, 1 - p * 1.3)})`);
      glow.addColorStop(1, 'rgba(80,255,160,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, r * (.45 + p * .6), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha *= (1 - p) * .95;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.save();
      ctx.scale(1, .42);
      ctx.beginPath(); ctx.arc(0, 0, r * (.2 + p * .9), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      break;
    }
    // 寿来: the white orb with a green rim that carries the siphon home.
    case 'soul-orb': {
      const bob = Math.sin((e.max - e.life) * 10) * 2;
      ctx.translate(e.x, e.y + bob);
      ctx.globalAlpha *= .55;
      ctx.fillStyle = '#3dff96';
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, e.life * 6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#52ffa8';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    // 我可是很脆弱的哦: white lily petals burst outward, then orbit for the whole window.
    case 'lily': {
      const r = e.radius ?? 92;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .7;
      ctx.strokeStyle = '#d9ffe8';
      ctx.lineWidth = 2.5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, 18 + p * r * .7, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + .2;
        const t = Math.min(1, p * 1.5 - (i % 3) * .04);
        if (t <= 0) continue;
        const d = 18 + t * r;
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d * .5 + t * t * 26);
        ctx.rotate(a + t * 4);
        ctx.globalAlpha = (1 - p) * .95;
        drawPetal(ctx, '#ffffff', '#e8f2ec');
        ctx.restore();
      }
      break;
    }
    // 完全复活: 宣战布告's pillar, gold. Top of the screen to the floor, plus chest glow and pool.
    case 'revive': {
      const x = e.x;
      const paint = revivePaint(ctx);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 1 - p;
      ctx.fillStyle = paint.beam;
      ctx.beginPath();
      ctx.moveTo(x - 22, 0);
      ctx.lineTo(x + 22, 0);
      ctx.lineTo(x + 100, FLOOR);
      ctx.lineTo(x - 100, FLOOR);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(x, FLOOR - 88);
      ctx.fillStyle = paint.glow;
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(x, FLOOR);
      ctx.scale(1, .3);
      ctx.fillStyle = paint.pool;
      ctx.beginPath();
      ctx.arc(0, 0, 105, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    // 完全复活's window: a small yellow ellipse with a faint bloom around it.
    case 'halo': {
      ctx.translate(e.x, e.y);
      ctx.save();
      ctx.strokeStyle = '#ffe98a';
      ctx.globalAlpha *= .2;
      ctx.lineWidth = 7.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 5.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#ffd54a';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 5.4, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    // 让大家幸福的音乐: the finished piano in front of the seated pose, with warm rings on the
    // beat. The image is top-anchored at place.y; propLayout 'kanata-piano' carries x / y / size.
    case 'happymusic': {
      const place = watchProp('kanata-piano');
      ctx.translate(e.x, e.y + place.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.translate(place.x, 0);
      const im = images?.get(PIANO_SRC);
      const dw = place.size;
      const dh = im?.naturalWidth ? dw * (im.naturalHeight / im.naturalWidth) : dw * (200 / 440);
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -dw / 2, 0, dw, dh);
      } else {
        ctx.fillStyle = '#2a2438';
        ctx.fillRect(-dw / 2, 0, dw, dh * .28);
        ctx.fillStyle = '#f3eefc';
        for (let i = 0; i < 12; i++) ctx.fillRect(-dw / 2 + 8 + i * (dw - 16) / 12, dh * .3, (dw - 16) / 12 - 3, dh * .13);
        ctx.fillStyle = '#241e30';
        ctx.fillRect(-dw / 2 + 10, dh * .45, dw - 20, dh * .55);
      }
      const beat = (p * 10) % 1;
      ctx.strokeStyle = '#fff2a0';
      ctx.lineWidth = 3;
      ctx.globalAlpha = (1 - beat) * .5;
      // This runs in the piano's local space (origin lifted to place.y = feet - 177), so +90
      // puts the ring at feet - 87, the seated body's center.
      ctx.beginPath(); ctx.arc(0, 90, 60 + beat * 130, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const q = (p * 6 + i / 4) % 1;
        ctx.fillStyle = i % 2 ? '#fff6b0' : '#ffe066';
        ctx.globalAlpha = (1 - q) * .6;
        ctx.beginPath();
        ctx.arc(-50 + i * 34, -90 - q * 90, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'apparatus': {
      // 舞台装置: 完全复活's gold pillar marks where the device lands. No ground pool.
      const x = e.x;
      const paint = revivePaint(ctx);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 1 - p;
      ctx.fillStyle = paint.beam;
      ctx.beginPath();
      ctx.moveTo(x - 22, 0);
      ctx.lineTo(x + 22, 0);
      ctx.lineTo(x + 100, FLOOR);
      ctx.lineTo(x - 100, FLOOR);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(x, FLOOR - 88);
      ctx.fillStyle = paint.glow;
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'war-piano': {
      // 起死开战: the grand piano in front of the seated pose.
      const place = watchProp('hotaru-piano');
      ctx.save();
      ctx.translate(e.x, e.y + place.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.translate(place.x, 0);
      const im = images?.get(HOTARU_PIANO_SRC);
      const dw = place.size;
      // The finished sheet is 512×512; the stand-in keeps the same footprint before it loads.
      const dh = im?.naturalWidth ? dw * (im.naturalHeight / im.naturalWidth) : dw;
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -dw / 2, 0, dw, dh);
      } else {
        // Stand-in grand: black silhouette with a lit keyboard strip, until the real art lands.
        ctx.fillStyle = '#241d2c';
        ctx.beginPath();
        ctx.moveTo(-dw / 2, dh * .95);
        ctx.quadraticCurveTo(-dw / 2, dh * .18, dw * .18, dh * .12);
        ctx.lineTo(dw / 2, dh * .48);
        ctx.quadraticCurveTo(dw * .08, dh * .62, -dw / 2, dh * .95);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f3eefc';
        for (let i = 0; i < 10; i++) ctx.fillRect(-dw / 2 + dw * .07 + i * dw * .05, dh * .26, dw * .037, dh * .09);
      }
      ctx.restore();
      // The white sound wave spreads from Hotaru, not from the piano's corner.
      const beat = (p * 12) % 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = (1 - beat) * .55;
      ctx.beginPath(); ctx.arc(e.x, e.y - 80, 52 + beat * 110, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    // 起死开战: a hard gust tears white petals across the screen from upper-left to lower-right.
    // Movement is curl-noise flow (Keith Peters' curl, as in bobbyroe/curl-particles) on a cheap
    // sine potential, plus a gust integral that cannot run backwards. Stateless: every petal is
    // placed from the clock and its index.
    case 'petal-rain': {
      const age = e.max - e.life;
      const fade = Math.min(1, age / .12, e.life / .35);
      const count = liteFx ? 55 : 110;
      // Integral of 1 + .18 sin(5.1t) + .12 sin(2.3t + 1.7): accelerates, never reverses.
      const gust = age + .0353 * (1 - Math.cos(age * 5.1))
        + .0522 * (Math.cos(1.7) - Math.cos(age * 2.3 + 1.7));
      for (let i = 0; i < count; i++) {
        const rx = noise01(i + 1), ry = noise01(i * 2.7 + 11);
        const speed = 520 + rx * 300;
        // Curl of a sine potential: divergence-free swirl, a few px of flutter on the gale line.
        const px = i * .7 + age * 2.3, py = i * 1.3 - age * 1.6;
        const swirlX = -Math.sin(px) * Math.cos(py) * 14;
        const swirlY = Math.cos(px) * Math.sin(py) * 10;
        const x = -W * .35 + rx * W * 1.3 + gust * speed + swirlX;
        const y = -H * .4 + ry * H * 1.25 + gust * speed * .45 + swirlY;
        if (x < -24 || x > W + 24 || y < -24 || y > H + 24) continue;
        const s = .55 + noise01(i + 5) * .3;
        ctx.save();
        ctx.translate(x, y);
        // Aligned roughly with the wind, then tumbling fast along it.
        ctx.rotate(.42 + noise01(i + 9) * .6 + age * (3 + ry * 4) + swirlX * .04);
        ctx.scale(s, s);
        ctx.globalAlpha = fade * (.4 + noise01(i + 3) * .35);
        drawPetal(ctx, '#ffffff', '#e8f2ec');
        ctx.restore();
      }
      break;
    }
    case 'drum-wave': {
      const grow = 8 + p * (e.radius ?? 24);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .9;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, grow, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .5;
      ctx.beginPath(); ctx.arc(0, 0, grow * .6, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'burst':
      ctx.translate(e.x, e.y);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * p, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'sprout-break': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .9;
      const w = 6 + p * 22;
      const h = 4 + p * 10;
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'clock-ring': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * p, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'jewel-ring': {
      // 我的世界火焰粒子：一团竖直小火从身上冒出，往上飘、换帧、缩小。不是扩散环。
      const half = e.radius ?? 72;
      let count = 0;
      for (let i = 0; i < JEWEL_PUFFS.length; i++) {
        const a = ((i * 47) % 97) / 97;
        const b = ((i * 73) % 89) / 89;
        const c = ((i * 19) % 83) / 83;
        const span = .5 + a * .5;
        const u = p / span;
        if (u >= 1) continue;
        const rise = (1 - Math.pow(.42, u)) / .58 * (48 + a * 42);
        const bit = JEWEL_PUFFS[count++];
        bit.x = (b - .5) * half * 2 + Math.sin(p * 20 + i) * 1.5;
        bit.y = (c - .5) * half * .55 - rise;
        bit.frame = (i + Math.floor(p * 16)) % 3;
        bit.shrink = 1 - u * u * .5;
        bit.alpha = u < .75 ? .95 : (1 - u) / .25 * .95;
      }
      sortJewelPuffs(count);
      ctx.translate(e.x, e.y);
      for (let i = 0; i < count; i++) {
        const bit = JEWEL_PUFFS[i];
        const inv = 1 / bit.shrink;
        ctx.translate(bit.x, bit.y);
        ctx.scale(bit.shrink, bit.shrink);
        ctx.globalAlpha = bit.alpha;
        for (const [x, y, k] of MC_FLAME[bit.frame]) {
          ctx.fillStyle = MC_FLAME_INK[k];
          ctx.fillRect(x * 2, y * 2, 2, 2);
        }
        ctx.scale(inv, inv);
        ctx.translate(-bit.x, -bit.y);
      }
      break;
    }
    case 'shigure-ring': {
      // 秋时雨: a bright ring blooms where each drop appears, then fades as the drop falls away.
      const grow = r * (.28 + .72 * p);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .95;
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#d6f4ff';
      ctx.beginPath(); ctx.arc(0, 0, grow, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#7ec8ff';
      ctx.stroke();
      break;
    }
    case 'smile-pulse': {
      // 世界微笑 impact pulse: the wave's own grin stamped on the victim, swelling once —
      // ghostly, fast, gone. e.radius is the full-swell size (~150% of the victim's height);
      // the swell eases out so it blows up fast and settles softly while fading.
      const im = images?.get(WAVE_SRC);
      const grow = 1 - Math.pow(1 - p, 3);
      const s = r * (.35 + .65 * grow);
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (im?.naturalWidth) {
        ctx.globalAlpha = (1 - p) * .5;
        ctx.drawImage(keyed(im), -s / 2, -s / 2, s, s);
      } else {
        const wr = Math.max(40, s * .85);
        ctx.strokeStyle = e.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - p) * .5 * (1 - i * .28);
          ctx.lineWidth = 9 - i * 2.5;
          ctx.beginPath();
          ctx.arc(-wr * .3 - i * wr * .22, 0, wr - i * 12, -1.15, 1.15);
          ctx.stroke();
        }
      }
      break;
    }
    case 'star-pulse': {
      // 星之鼓动 impact pulse: the star's own shape stamped on the landing point, swelling
      // once — ghostly, fast, gone, the same beat as kokoro's smile pulse.
      const im = images?.get(KASUMI_STAR_SRC);
      const grow = 1 - Math.pow(1 - p, 3);
      const s = r * (.35 + .65 * grow);
      ctx.translate(e.x, e.y);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (im?.naturalWidth) {
        ctx.globalAlpha = (1 - p) * .5;
        ctx.drawImage(keyed(im), -s / 2, -s / 2, s, s);
      } else {
        ctx.strokeStyle = e.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - p) * .5 * (1 - i * .28);
          ctx.lineWidth = 9 - i * 2.5;
          starPath(ctx, s * (.55 - i * .14));
          ctx.stroke();
        }
      }
      break;
    }
    case 'debt': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = .8;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, e.radius ?? 52, 16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'compose': {
      const half = e.radius ?? 100;
      const elapsed = e.max - e.life;
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#EE5577';
      ctx.strokeStyle = '#EE5577';
      for (let i = 0; i < 7; i++) {
        const u = (elapsed * 1.4 + i / 7) % 1;
        const x = -half + 16 + (i * 27) % (half * 2 - 20);
        const y = -240 + u * 250;
        ctx.globalAlpha = .9;
        ctx.fillRect(x, y, 3, 12);
        ctx.beginPath(); ctx.ellipse(x - 4, y + 12, 6, 4, -.4, 0, Math.PI * 2); ctx.fill();
        // Notes are pure paint, so each one rings from u itself: once at spawn,
        // once as it crosses the floor line on the way down.
        const k = u < .14 ? u / .14 : u > .86 ? (u - .86) / .14 : -1;
        if (k >= 0) {
          ctx.globalAlpha = (1 - k) * .8;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, u < .14 ? y + 6 : 0, 5 + k * 13, 0, Math.PI * 2); ctx.stroke();
        }
      }
      break;
    }
    case 'howl': {
      // 满月嚎叫: a ring in the screen plane, centred on her chest, not a floor ellipse.
      const radius = e.radius ?? 87;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, radius * Math.max(p, .15), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .55;
      ctx.beginPath(); ctx.arc(0, 0, radius * Math.max(p, .15) * .62, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'yokan': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 80) * (.35 + p * .65), 10 + p * 8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'steak': {
      // 大份牛排: blue pluses above her when the bite lands.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#6eb6ff';
      ctx.lineWidth = 3;
      for (const [x, y] of [[-26, 8], [0, -16], [24, 2], [-10, -34], [16, -30]] as const) {
        const yy = y - p * 18;
        ctx.beginPath();
        ctx.moveTo(x - 6, yy); ctx.lineTo(x + 6, yy);
        ctx.moveTo(x, yy - 6); ctx.lineTo(x, yy + 6);
        ctx.stroke();
      }
      break;
    }
    case 'feast': {
      // 超恢复: a parenthesis on each side. Drawn while the buff holds, gone the frame it ends.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = .9;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(-32, 8, 36, Math.PI * .62, Math.PI * 1.38); ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 8, 36, -Math.PI * .38, Math.PI * .38); ctx.stroke();
      break;
    }
    case 'marathon': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 18, 10);
        ctx.lineTo(side * (28 + p * 36), -8 - p * 20);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, 28, 36 + p * 20, 8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'ripple': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 300) * p, 16 + p * 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#c45a6a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 300) * p * .72, 10, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'whale-pool': {
      // 巨鲸: a flat sea disc on the foot line. Two arcs swirl, two ripples walk out.
      const rad = e.radius ?? 120;
      const ry = rad * .26;
      const fade = Math.min(1, e.life * 6);
      const spin = p * 8;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = fade * .2;
      ctx.fillStyle = '#1c6eb8';
      ctx.beginPath(); ctx.ellipse(0, 0, rad, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade * .1;
      ctx.fillStyle = '#4EDFF9';
      ctx.beginPath(); ctx.ellipse(0, 0, rad * .4, ry * .4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7eebff';
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const a0 = spin + i * 2.2;
        ctx.globalAlpha = fade * (.21 - i * .06);
        ctx.lineWidth = 3 - i;
        ctx.beginPath(); ctx.ellipse(0, 0, rad * (.46 + i * .24), ry * (.46 + i * .24), 0, a0, a0 + 1.7); ctx.stroke();
      }
      for (let i = 0; i < 2; i++) {
        const t = (p * 1.2 + i * .5) % 1;
        ctx.globalAlpha = fade * (1 - t) * .15;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, rad * (.62 + t * .48), ry * (.62 + t * .48), 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'shade': {
      // 暗玉: a dark pool opens at her feet and closes again.
      const rad = e.radius ?? 220;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .85;
      ctx.fillStyle = '#241c44';
      ctx.beginPath(); ctx.ellipse(0, 20, rad * (.25 + p * .75), 22 + p * 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha *= .55;
      ctx.fillStyle = '#6677CC';
      ctx.beginPath(); ctx.ellipse(0, 20, rad * p * .45, 12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'huh': {
      // 哈？: a jagged speech bubble bursts out of the shout while rings chase it along the floor.
      const r = e.radius ?? 280;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, r * p, 16 + p * 10, 0, 0, Math.PI * 2); ctx.stroke();
      const grow = Math.min(1, p * 2.2);
      const bx = (e.dir ?? 1) * r * .38 * grow;
      const by = -52 - grow * 24;
      const s = 28 + grow * 26;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate((e.dir ?? 1) * -.06);
      ctx.globalAlpha *= Math.min(1, (1 - p) * 1.6);
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        const rad = s * (i % 2 ? 1.16 : .94);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * .82;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, s * .74); ctx.lineTo(2, s * 1.08); ctx.lineTo(10, s * .7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#171120';
      ctx.font = `900 ${Math.round(s * .78)}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('哈？', 0, 2);
      ctx.restore();
      break;
    }
    case 'tsun': {
      // 脸靠的太近了: a hot-red pride ring slams out along the floor, a thinner one chasing it.
      const r = e.radius ?? 280;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#ff5f7a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i <= 22; i++) {
        const ang = (i / 22) * Math.PI * 2;
        const rad = r * p * (i % 2 ? 1.05 : .93);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * .32;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 0, r * p * .7, 12 + p * 8, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'box': {
      // 无敌仓库大王: a cardboard dust ring, scraps of packing paper kicking up around it.
      const r = e.radius ?? 200;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = '#c8965a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, r * p, 14 + p * 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8d9b0';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + p * 2;
        const d = r * (.3 + p * .7);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d * .3 - p * 30);
        ctx.rotate(a * 2);
        ctx.fillRect(-6, -4, 12, 8);
        ctx.restore();
      }
      break;
    }
    case 'riff':
    case 'sing': {
      // 吉他激奏 / 这次是真的在唱！: sound rings race out from her chest and fade
      // as they widen. The sing's script keeps the reach flat, so its rings hold one radius.
      const r = e.radius ?? (e.type === 'riff' ? 240 : 260);
      const alt = e.type === 'riff' ? '#d8f7e2' : '#ffe3f1';
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.5 - i * .18);
        if (ring <= 0) continue;
        ctx.globalAlpha = Math.min(1, e.life * 6) * (1 - ring * .8) * .9;
        ctx.strokeStyle = i === 0 ? e.color : alt;
        ctx.lineWidth = (5 - i) * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(6, r * ring), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'chop': {
      // 劈瓦手刀: the chop arc slams down and a spray of pink tile shards bursts forward,
      // fanning up from the strike point and dropping under gravity.
      ctx.translate(e.x, e.y); ctx.scale(e.dir ?? 1, 1);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 8 * (1 - p) + 2;
      ctx.beginPath(); ctx.arc(-16, -10, Math.max(10, r), -2.4, -.2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const t = p * 1.7 - i * .13;
        if (t <= 0 || t >= 1) continue;
        const ang = -.85 - (i % 4) * .38;
        const dist = t * r * (1.3 + (i % 3) * .4);
        const size = 6 + (i % 3) * 5;
        ctx.save();
        ctx.translate(Math.cos(ang) * dist, Math.sin(ang) * dist + t * t * 150);
        ctx.rotate(t * 10 + i);
        ctx.fillStyle = i % 2 ? '#ffb3d9' : e.color;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
      break;
    }
    case 'flashbulbs': {
      // 丸山闪光: camera bulbs pop across the arena; each one is a white starburst.
      for (let i = 0; i < 7; i++) {
        const t = p * 2.2 - i * .28;
        if (t <= 0 || t >= 1) continue;
        const bx = e.x + Math.sin(i * 12.9898) * 420;
        const by = e.y - 60 - Math.abs(Math.cos(i * 7.233)) * 150 + i * 24;
        ctx.save();
        ctx.translate(bx, by);
        ctx.globalAlpha = (1 - t) * .9;
        ctx.fillStyle = '#fffdf4';
        starPath(ctx, 9 + (1 - t) * 15);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'wind': {
      // 来去如风: a coil of wind bursts at the spot; a few leaves ride it out.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineCap = 'round';
      const spin = p * 6 * (e.dir ?? 1);
      for (let i = 0; i < 3; i++) {
        const a0 = spin + i * 2.1;
        ctx.lineWidth = 4 - i;
        ctx.beginPath(); ctx.arc(0, -i * 13, 30 + i * 9, a0, a0 + 2); ctx.stroke();
      }
      ctx.fillStyle = '#d9f4e3';
      for (let i = 0; i < 3; i++) {
        const t = p * 1.5 - i * .2;
        if (t <= 0 || t >= 1) continue;
        const lx = (e.dir ?? 1) * t * 74;
        const ly = -i * 16 - t * 40 + Math.sin(t * 8 + i * 2) * 10;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(t * 10 * (e.dir ?? 1));
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
      break;
    }
    case 'blue-rose': {
      // 荆棘的蓝蔷薇: a ring of thorns bursts outward while a halo of petals scatters and falls.
      const r = e.radius ?? 210;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 2; i++) {
        const ring = Math.min(1, p * 1.4 - i * .2);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - ring) * .9;
        ctx.strokeStyle = i === 0 ? '#5a8fd8' : '#9cc4ff';
        ctx.lineWidth = (4 - i) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, Math.max(6, r * ring), 14 + ring * 8, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#6fa8ff';
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + .4;
        const t = Math.min(1, p * 1.6);
        const px = Math.cos(ang) * r * t;
        const py = Math.sin(ang) * r * t * .3 - t * 46 + t * t * 40;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + t * 5);
        ctx.globalAlpha = (1 - p) * .85;
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'rose-petal': {
      // 荆棘的蓝蔷薇: one petal sways down from where the bloom dropped it.
      const fall = p * 150;
      const sway = Math.sin(p * 9) * 14;
      ctx.translate(e.x + sway, e.y + fall);
      ctx.rotate(Math.sin(p * 9) * .9 + p * 3);
      ctx.globalAlpha = (1 - p) * .9;
      drawPetal(ctx, '#6fa8ff', '#9cc4ff');
      break;
    }
    case 'summit': {
      // 顶点: the shout is a 360° wave facing the screen — rings race out of her body in
      // circle space (no floor perspective) with a white-hot core flash on the cast.
      const r = e.radius ?? 560;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 4; i++) {
        const ring = Math.min(1, p * 1.35 - i * .14);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - ring) * .95;
        ctx.strokeStyle = i === 0 ? '#eaf4ff' : i === 1 ? '#cfe6ff' : '#8fb8ff';
        ctx.lineWidth = (6 - i * 1.2) * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(8, r * ring), 0, Math.PI * 2); ctx.stroke();
      }
      if (p < .4) {
        ctx.globalAlpha = (1 - p / .4) * .8;
        ctx.fillStyle = '#eaf4ff';
        ctx.beginPath(); ctx.arc(0, 0, 40 * (p / .4) + 10, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'black-shout': {
      // 漆黑呐喊: the seal burns off — a dark indigo burst with a blue flame standing in it.
      const r = e.radius ?? 130;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .9;
      ctx.strokeStyle = '#3f6fd8';
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * p, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - p) * .5;
      ctx.fillStyle = '#1c2450';
      ctx.beginPath(); ctx.arc(0, 0, r * p * .7, 0, Math.PI * 2); ctx.fill();
      const flick = Math.sin(p * 26) * 3;
      ctx.globalAlpha = (1 - p);
      ctx.fillStyle = '#5fd0ff';
      ctx.beginPath();
      ctx.moveTo(0, -r * .85 - flick);
      ctx.quadraticCurveTo(r * .22, -r * .3, 0, r * .18);
      ctx.quadraticCurveTo(-r * .22, -r * .3, 0, -r * .85 - flick);
      ctx.fill();
      break;
    }
    case 'eye-flame': {
      // 漆黑呐喊: one wisp of blue flame sheds off the eyes and drifts back over the hair.
      const drift = -(e.dir ?? 1) * p * 46;
      ctx.translate(e.x + drift, e.y - p * 26 + Math.sin(p * 12) * 4);
      ctx.rotate(-(e.dir ?? 1) * .5 + Math.sin(p * 14) * .2);
      ctx.globalAlpha = (1 - p) * .95;
      const s = 7 * (1 - p * .55);
      ctx.fillStyle = '#5fd0ff';
      ctx.beginPath();
      ctx.moveTo(0, -s * 2.1);
      ctx.quadraticCurveTo(s * .8, -s * .5, 0, s * .55);
      ctx.quadraticCurveTo(-s * .8, -s * .5, 0, -s * 2.1);
      ctx.fill();
      ctx.fillStyle = '#d8f4ff';
      ctx.beginPath(); ctx.ellipse(0, -s * .2, s * .3, s * .75, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'parfait': {
      // 抹茶芭菲: the parfait stands on the floor; a green glow pulses under the eruption.
      // Silhouette flash (残影 without the travel): same-size flat tinted copies appear at once and
      // fade, staggered, behind the parfait as it lands and again as it leaves — no scaling at all.
      const t = e.max - e.life;
      const PULSE = .55;
      ctx.translate(e.x, e.y);
      const im = images?.get(PARFAIT_SRC);
      const has = !!im?.naturalWidth;
      const w = 200, h = 200;
      const sil = has ? tintedSilhouette(keyed(im), im.naturalWidth, im.naturalHeight, e.color) : null;
      const shapes = (fill: string) => {
        ctx.fillStyle = fill;
        square(-46, -176, 92, 36);
        square(-56, -144, 112, 36);
        square(-42, -108, 84, 102);
      };
      const flash = (k: number) => {
        if (k <= 0 || k >= 1) return;
        for (let i = 2; i >= 0; i--) {
          const tt = k * 1.5 - i * .14;
          if (tt <= 0 || tt >= 1) continue;
          ctx.save();
          ctx.globalAlpha = (tt < .3 ? 1 : 1 - (tt - .3) / .7) * .34;
          if (sil) ctx.drawImage(sil, -w / 2, -h + 10, w, h);
          else shapes(e.color);
          ctx.restore();
        }
      };
      flash(t / PULSE);
      flash((PULSE - e.life) / PULSE);
      const glow = .5 + Math.sin(t * 9) * .2;
      ctx.globalAlpha = glow * .55;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(0, -4, 76, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, t * 4, e.life * 3);
      if (has) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -w / 2, -h + 10, w, h);
      } else {
        shapes('#f6f2e8');
        ctx.fillStyle = e.color;
        square(-56, -144, 112, 36);
        square(-42, -108, 84, 102);
        ctx.fillStyle = '#e05a7a';
        ctx.beginPath(); ctx.arc(0, -182, 12, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'resolve': {
      // 就由我来结束一切: brown shockwave rings spreading from her stance, a pale crest on the outer wave.
      const r = e.radius ?? 190;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .95;
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.5 - i * .18);
        if (ring <= 0) continue;
        ctx.strokeStyle = i === 2 ? '#f6e7bd' : '#a5714f';
        ctx.lineWidth = (7 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .34 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#a5714f';
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.moveTo(-r * .3, 8); ctx.lineTo(-r * .3, -r * .55 * p - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * .3, 8); ctx.lineTo(r * .3, -r * .55 * p - 8); ctx.stroke();
      break;
    }
    case 'plaster': {
      // 绊创膏: the plaster pulses — three translucent copies of itself scale up and spin out from the one on her chest.
      const im = images?.get(PLASTER_SRC);
      const base = Math.min(1, e.life * 3);
      ctx.translate(e.x, e.y);
      const draw = (scale: number, alpha: number, rot: number) => {
        if (alpha <= 0) return;
        ctx.save();
        ctx.rotate(rot);
        ctx.globalAlpha = alpha;
        const w = 120 * scale;
        if (im?.naturalWidth) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(keyed(im), -w / 2, -w / 2, w, w);
        } else {
          ctx.fillStyle = '#f7e8da';
          square(-w * .4, -w * .12, w * .8, w * .24);
          ctx.fillStyle = e.color;
          for (const px of [-w * .12, w * .12]) {
            ctx.beginPath(); ctx.arc(px, 0, w * .08, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      };
      for (let i = 0; i < 3; i++) {
        const tt = Math.min(1, Math.max(0, (p * 1.2 - i * .22) / .55));
        if (tt <= 0 || tt >= 1) continue;
        draw(1 + tt * 1.2, (1 - tt) * .55, (e.dir ?? 1) * (-.45 + tt * .8));
      }
      draw(1, base * .95, (e.dir ?? 1) * -.45);
      break;
    }
    case 'poem': {
      // 诗超绊: three rings swell out of the stance for the length of the sing, notes riding the front.
      const r = e.radius ?? 220;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.25 - i * .16);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - p) * (.9 - i * .22);
        ctx.lineWidth = (6 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .36 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#fff9e6';
      ctx.globalAlpha = (1 - p) * .9;
      for (const side of [-1, 1]) {
        const nx = side * r * .55 * p, ny = -r * (.28 + side * .08) * p;
        ctx.fillRect(nx - 1.5, ny - 9, 3, 9);
        ctx.beginPath(); ctx.ellipse(nx - 3, ny, 4.5, 3, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'muscle': {
      // 高肌肉！: golden rings pop out of the stance while two power streaks climb past her arms.
      const r = e.radius ?? 190;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .95;
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.5 - i * .18);
        if (ring <= 0) continue;
        ctx.strokeStyle = i === 2 ? '#fff7c2' : e.color;
        ctx.lineWidth = (7 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .34 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#fff7c2';
      ctx.lineWidth = 3 * (1 - p) + 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * .3, 8);
        ctx.lineTo(side * r * .3, -r * .55 * p - 8);
        ctx.stroke();
      }
      break;
    }
    case 'boost': {
      // 认真模式: a confident double ring pops at her chest with a few orbiting sparks.
      const r = e.radius ?? 90;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r * Math.min(1, p * 1.4), 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * Math.min(1, p * 1.4) * .72, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = e.color;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.256 + p * 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * .9, Math.sin(a) * r * .6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'dream': {
      // 梦想即力量！: a golden starburst — rings swell while eight rays shoot out of the pose.
      const r = e.radius ?? 220;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const ring = Math.min(1, p * 1.25 - i * .16);
        if (ring <= 0) continue;
        ctx.globalAlpha = (1 - p) * (.9 - i * .22);
        ctx.strokeStyle = i === 0 ? e.color : '#fff7c2';
        ctx.lineWidth = (6 - i * 2) * (1 - p) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * ring, r * .36 * ring, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.strokeStyle = e.color;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + p * .6;
        const a = Math.min(1, p * 1.6);
        if (a <= 0) continue;
        ctx.globalAlpha = (1 - p) * .8;
        ctx.lineWidth = 4 * (1 - p) + 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r * .3 * a, Math.sin(ang) * r * .15 * a - 20);
        ctx.lineTo(Math.cos(ang) * r * .78 * a, Math.sin(ang) * r * .39 * a - 20);
        ctx.stroke();
      }
      break;
    }
    case 'slam':
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.4 + p), 18 + p * 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff6ea';
      ctx.globalAlpha *= .7;
      ctx.beginPath(); ctx.ellipse(0, 0, r * .25 * (1 - p), 8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'mortis': {
      const travel = Math.min(1, p / 0.25);
      const x = e.x + (e.dir ?? 1) * (e.radius ?? 280) * travel;
      let alpha = 1;
      if (p < 0.06) alpha = p / 0.06;
      if (p > 0.78) alpha = Math.max(0, (1 - p) / 0.22);
      ctx.globalAlpha = alpha;
      const [col, row] = mortisFrame(p);
      const im = images?.get(MORTIS_SRC);
      ctx.translate(x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      const ghost = mortisAfterimage(p);
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (ghost) drawMortisGhost(ctx, im, ghost[0], ghost[1], alpha * .5);
        ctx.globalAlpha = alpha;
        ctx.drawImage(keyed(im), col * CELL, row * CELL, CELL, CELL, -MORTIS_H / 2, -MORTIS_H, MORTIS_H, MORTIS_H);
      } else {
        ctx.fillStyle = e.color;
        ctx.fillRect(-7, -MORTIS_H * .7, 14, MORTIS_H * .42);
        ctx.beginPath(); ctx.arc(0, -MORTIS_H * .8, 12, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'strum':
    case 'spin': {
      // Headstock stays on the pivot; the body is the far end. Spin orbits her in screen space.
      // Strum is a held guitar: smaller, neck rising back to the shoulder, body down in front.
      const elapsed = e.age ?? (e.max - e.life);
      const im = images?.get(GUITAR_SRC);
      const spin = e.type === 'spin';
      const place = watchProp(spin ? 'anon-spin' : 'anon-strum');
      const u = !spin || elapsed <= .28 ? 0 : Math.min(1, (elapsed - .28) / .7);
      const angle = spin ? u * Math.PI * 4 + place.rot : place.rot;
      const dw = place.size;
      const dh = im?.naturalWidth ? dw * (im.naturalHeight / im.naturalWidth) : dw / 2;
      const stamp = (src: CanvasImageSource | null, ang: number) => {
        ctx.save();
        ctx.translate(e.x, e.y + place.y);
        if (spin) ctx.translate(place.x, 0);
        else ctx.scale(e.dir ?? 1, 1);
        if (!spin) ctx.translate(place.x, 0);
        ctx.rotate(ang);
        if (src) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.scale(-1, 1);
          ctx.drawImage(src, -GUITAR_HEAD_X * dw, -GUITAR_HEAD_Y * dh, dw, dh);
        } else {
          ctx.fillStyle = e.color;
          const len = dw * (spin ? 280 / 420 : 110 / 156);
          ctx.fillRect(0, -6, len, 12);
          ctx.beginPath(); ctx.moveTo(len - 30, -6); ctx.lineTo(len + 20, -36); ctx.lineTo(len + 32, 28); ctx.lineTo(len - 30, 6); ctx.fill();
        }
        ctx.restore();
      };
      // The guitar itself, half faded, a short arc behind. Not during wind-up or the held end.
      if (spin && im?.naturalWidth && u > 0 && u < 1) {
        ctx.save();
        ctx.globalAlpha *= .45;
        stamp(keyed(im), angle - .5);
        ctx.restore();
      }
      stamp(im?.naturalWidth ? keyed(im) : null, angle);
      break;
    }
    case 'rabbit': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-6, 0, 8 + p * 6, .2, Math.PI - .2); ctx.stroke();
      ctx.beginPath(); ctx.arc(8, 2, 7 + p * 5, .3, Math.PI - .1); ctx.stroke();
      break;
    }
    case 'kiss': {
      // 抱抱还是亲亲: one light-pink heart blooms on the body and fades. Five kisses, five pulses.
      ctx.translate(e.x, e.y);
      const s = 16 + p * 36;
      ctx.globalAlpha = (1 - p) * .8;
      ctx.fillStyle = '#ffd0e4';
      ctx.beginPath();
      ctx.moveTo(0, s * .3);
      ctx.bezierCurveTo(s * .2, s * .1, s * .5, -s * .3, s * .5, -s * .5);
      ctx.bezierCurveTo(s * .5, -s * .85, s * .1, -s * .85, 0, -s * .5);
      ctx.bezierCurveTo(-s * .1, -s * .85, -s * .5, -s * .85, -s * .5, -s * .5);
      ctx.bezierCurveTo(-s * .5, -s * .3, -s * .2, s * .1, 0, s * .3);
      ctx.fill();
      break;
    }
    case 'half': {
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .8;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.3 + p * .7), r * .4 * (.3 + p), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - p) * .35;
      ctx.beginPath(); ctx.ellipse(-12, 0, r * .25, r * .35, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(12, 0, r * .25, r * .35, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'king': {
      const rad = e.radius ?? 160;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .85;
      ctx.fillStyle = '#fff6fb';
      ctx.beginPath(); ctx.ellipse(0, -10, 28 + p * 40, 46 + p * 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd0dc';
      ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, rad * (.2 + p * .8), rad * .28 * (.2 + p), 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'claw': {
      // 狼爪: one frame of the claw sheet, drawn additively so its black ground vanishes. The row is
      // the swing (light / pounce / air), the column the moment. Preloaded through the character's
      // extras; until it decodes, the swing draws nothing.
      const sheet = images?.get(CLAW_SRC);
      if (!sheet?.naturalWidth) break;
      const t = e.max - e.life;
      const row = e.air ? 2 : e.heavy ? 1 : 0;
      let col = 0;
      while (col < CLAW_FRAMES.length && t >= CLAW_FRAMES[col]) col++;
      const size = Math.max(150, (e.radius ?? 130) * 1.55) * (e.heavy ? 1.15 : 1);
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // A clean hit stacks the full-slash frame twice for one extra pop of light.
      const passes = e.hit && col === 1 ? 2 : 1;
      for (let i = 0; i < passes; i++) ctx.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, -size / 2, -size / 2, size, size);
      break;
    }
    case 'sandwich': {
      // 专业工种: she makes the sandwich and the foe is in it. The outbound pass slaps a bread
      // triangle on from her side; the return slams the finished cut face on, squashed, crumbs flying.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      const full = !!e.heavy;
      const R = 66;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .16);
      // A convenience-store triangle sandwich, cut face to the camera, point up.
      const tri = () => { ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R * .95, R * .62); ctx.lineTo(-R * .95, R * .62); ctx.closePath(); };
      const slam = Math.min(1, t / .07);
      // Flies in from her side, overshoots into a squash, settles.
      const settle = t < .07 ? 0 : Math.max(0, 1 - (t - .07) / .1);
      const sx = 1 + .28 * settle, sy = 1 - .22 * settle;
      ctx.save();
      ctx.translate(-dir * (1 - slam) * 130, -(1 - slam) * 30);
      ctx.rotate(-dir * (1 - slam) * .6 + (full ? 0 : -dir * .12));
      ctx.scale(sx, sy);
      tri();
      ctx.fillStyle = '#c98535'; ctx.fill();
      ctx.save();
      ctx.scale(.86, .86); ctx.translate(0, 4);
      tri(); ctx.clip();
      if (!full) {
        // The first pass: just the bread slice slapped on.
        ctx.fillStyle = '#fff6e0'; ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.fillStyle = 'rgba(201,133,53,.3)';
        for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(((i * 37) % 70) - 35, ((i * 23) % 70) - 30, 2, 0, Math.PI * 2); ctx.fill(); }
      } else {
        // Pressed shut: bread, lettuce, ham, egg, bread — the layers of the cut face.
        const bands: [string, number][] = [['#fff6e0', -R], ['#7bc94f', -12], ['#f19aa0', 0], ['#ffd84a', 13], ['#fff6e0', 28]];
        for (let i = 0; i < bands.length; i++) {
          const [col, y] = bands[i];
          ctx.fillStyle = col;
          ctx.fillRect(-R, y, R * 2, R * 2);
        }
        // Lettuce frill along the top of its band.
        ctx.fillStyle = '#5fb03a';
        ctx.beginPath(); ctx.moveTo(-R, -10);
        for (let x = -R; x < R; x += 10) ctx.quadraticCurveTo(x + 5, -19, x + 10, -10);
        ctx.lineTo(R, -6); ctx.lineTo(-R, -6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = '#8a5520';
      tri(); ctx.stroke();
      ctx.restore();
      // Impact: three short white strokes on her side as it lands.
      if (t > .05 && t < .2) {
        ctx.globalAlpha = 1 - (t - .05) / .15;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        for (const y of [-30, 0, 30]) {
          ctx.beginPath(); ctx.moveTo(-dir * (R + 8), y); ctx.lineTo(-dir * (R + 34), y + (y / 30) * 10); ctx.stroke();
        }
      }
      if (full && t > .07) {
        // A pop ring and crumbs thrown out on both sides.
        const k = Math.min(1, (t - .07) / .4);
        ctx.globalAlpha = (1 - k) * Math.min(1, e.life / .16);
        ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, R + k * 60, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e2b468';
        for (let i = 0; i < 10; i++) {
          const ang = -Math.PI / 2 + (i - 4.5) * .32;
          const sp = 130 + (i % 3) * 40;
          const cx = Math.cos(ang) * sp * k * (i % 2 ? 1 : -1);
          const cy = Math.sin(ang) * sp * k + 240 * k * k;
          ctx.fillRect(cx - 3, cy - 3, 5 + (i % 2) * 2, 5);
        }
      }
      break;
    }
    case 'heart-eyes': {
      // 天才♡: two hearts pop at the eyes and float up, swelling, then a smaller pair follows.
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 4; i++) {
        const k = Math.max(0, Math.min(1, (t - (i >> 1) * .18) / .7));
        if (k <= 0 || k >= 1) continue;
        const side = i % 2 ? 1 : -1;
        ctx.save();
        ctx.translate(side * (10 + k * 16), -k * 46 - (i >> 1) * 6);
        ctx.rotate(side * .22);
        ctx.globalAlpha = (1 - k) * .95;
        ctx.fillStyle = i < 2 ? '#ff6fcf' : '#ffb2e8';
        heartPath(ctx, (i < 2 ? 11 : 8) * (.6 + k * .6));
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'feign-tears': {
      // 好痛……♡: lying in the act — two fake teardrops arc off her and a wobbling 「呜」 hangs over her.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.fillStyle = '#bfe6ff';
      for (let i = 0; i < 2; i++) {
        const k = ((t * 1.6 + i * .5) % 1);
        ctx.globalAlpha = (1 - k) * .85;
        const tx = -dir * (34 + i * 14) - dir * k * 26, ty = -46 - Math.sin(k * Math.PI) * 30 + k * 26;
        ctx.beginPath(); ctx.ellipse(tx, ty, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = Math.min(1, t / .15) * Math.min(1, e.life / .15) * .9;
      ctx.fillStyle = e.color;
      ctx.font = `bold 20px "Ma Shan Zheng", KaiTi, STKaiti, "Noto Serif SC", serif`;
      ctx.textAlign = 'center';
      ctx.fillText('呜', -dir * 10 + Math.sin(t * 9) * 3, -96);
      break;
    }
    case 'praise-petal': {
      // 您真是天才呢♡: one petal tossed behind the dash — it flutters down, turning, and fades.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      ctx.translate(e.x - dir * t * 40, e.y + t * t * 120 + Math.sin(t * 11) * 4);
      ctx.rotate(t * 7 * dir);
      ctx.globalAlpha = (1 - p) * .8;
      if (liteFx) ctx.fillStyle = '#ffc6ea';
      else {
        const g2 = ctx.createLinearGradient(0, -r, 0, r);
        g2.addColorStop(0, '#fff3fb');
        g2.addColorStop(1, '#ff9fdc');
        ctx.fillStyle = g2;
      }
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.quadraticCurveTo(r * .9, 0, 0, -r);
      ctx.quadraticCurveTo(-r * .9, 0, 0, r);
      ctx.fill();
      break;
    }
    case 'praise-pop': {
      // 您真是天才呢♡: on the praised head, three small hearts rise in a fan and a single sparkle winks.
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const k = Math.max(0, Math.min(1, (p - i * .1) / .8));
        if (k <= 0) continue;
        ctx.save();
        ctx.translate(dir * (i - 1) * 16 * (.6 + k), -k * 30 - (i === 1 ? 8 : 0));
        ctx.rotate((i - 1) * .3);
        ctx.globalAlpha = (1 - k) * .85;
        ctx.fillStyle = i === 1 ? '#ff7fcf' : '#ffb6e6';
        heartPath(ctx, 6 + k * 3);
        ctx.fill();
        ctx.restore();
      }
      if (p < .4) {
        const k = p / .4;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        const sz = 4 + Math.sin(k * Math.PI) * 8;
        ctx.beginPath(); ctx.moveTo(dir * 26, -14 - sz); ctx.lineTo(dir * 26, -14 + sz);
        ctx.moveTo(dir * 26 - sz, -14); ctx.lineTo(dir * 26 + sz, -14); ctx.stroke();
      }
      break;
    }
    case 'fade-petals': {
      // 请成为主角吧♡: as she fades, five pale petals peel off her and drift back and up into the dark.
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 5; i++) {
        const k = Math.max(0, Math.min(1, (p - i * .06) / .85));
        if (k <= 0 || k >= 1) continue;
        const ox = (i - 2) * 14 - dir * k * (40 + i * 10);
        const oy = (i % 2 ? -30 : 20) - k * (50 + i * 8);
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(k * 4 + i);
        ctx.globalAlpha = (1 - k) * .55;
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'feign-pop': {
      // 骗你的♡: where she lay, a pink puff and a burst of small hearts.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .55;
      ctx.beginPath(); ctx.arc(0, 0, r * (.5 + p * .8), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#ffd6f4';
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + .3;
        ctx.save();
        ctx.translate(Math.cos(a) * r * (.4 + p * 1.1), Math.sin(a) * r * (.4 + p * 1.1));
        heartPath(ctx, 7);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'spotlight': {
      // 请成为主角吧♡: a stage spotlight from the top of the frame onto the floor.
      const t = e.max - e.life;
      const land = Math.min(1, t / .1);
      const fade = Math.min(1, e.life / .25);
      const bottom = r;
      const top = bottom * .3;
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      const strength = .42 * land;
      const beam = ctx.createLinearGradient(-bottom, 0, bottom, 0);
      beam.addColorStop(0, 'rgba(255,214,244,0)');
      beam.addColorStop(.5, `rgba(255,240,250,${strength * fade})`);
      beam.addColorStop(1, 'rgba(255,214,244,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-top, -e.y); ctx.lineTo(top, -e.y); ctx.lineTo(bottom, 0); ctx.lineTo(-bottom, 0);
      ctx.closePath(); ctx.fill();
      const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, bottom * 1.2);
      pool.addColorStop(0, `rgba(255,245,252,${.6 * fade})`);
      pool.addColorStop(1, 'rgba(255,200,240,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(0, 0, bottom * 1.2, bottom * .28, 0, 0, Math.PI * 2); ctx.fill();
      // A few motes drift down the beam, catching the light.
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const u = (i * .29 + t * (.5 + (i % 3) * .15)) % 1;
        const half = top + (bottom - top) * u;
        ctx.globalAlpha = fade * land * (.35 + .35 * Math.sin(t * 9 + i * 2)) * (1 - Math.abs(u - .55));
        ctx.beginPath(); ctx.arc(Math.sin(i * 2.7 + t * 1.3) * half * .55, -e.y * (1 - u), 1.6 + (i % 2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (t < .18) {
        ctx.globalAlpha = 1 - t / .18;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, bottom * (1 + t * 3), bottom * .28 * (1 + t * 3), 0, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'coffin': {
      // 康乃馨盛开之日: her own coffin stands up behind her, front face to the screen, and holds
      // through the drumming. It rises in, and on the way out fades as the carnations spill.
      const im = images?.get(COFFIN_SRC);
      const t = e.max - e.life;
      // Snaps in on the cast; the fade out is the step out of the coffin.
      const rise = Math.min(1, t / .08);
      const out = Math.min(1, e.life / .35);
      // One scale for both axes, so the rise grows the coffin instead of stretching it.
      const grow = .85 + rise * .15;
      const aspect = im?.naturalWidth ? im.naturalWidth / im.naturalHeight : 1;
      const h = COFFIN_SIZE * grow, w = h * aspect;
      const foot = h * COFFIN_FOOT;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = rise * out;
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(keyed(im), -w / 2, -foot, w, h);
      } else {
        // Placeholder: a white hexagonal coffin face with a pink carnation band, slimmed to a coffin's width.
        ctx.save();
        ctx.scale(.62, 1);
        ctx.fillStyle = '#f4eef4';
        ctx.strokeStyle = '#8a6f8a'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-w * .32, -h); ctx.lineTo(w * .32, -h); ctx.lineTo(w * .5, -h * .72);
        ctx.lineTo(w * .36, 0); ctx.lineTo(-w * .36, 0); ctx.lineTo(-w * .5, -h * .72); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ee99ee';
        for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc((i - 3) * w * .11, -h * .72 + Math.sin(i * 2.1) * 6, 9, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (e.life < .45) {
        const k = 1 - e.life / .45;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ee99ee';
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i - 4.5) * .3;
          ctx.save();
          ctx.translate(Math.cos(a) * 120 * k, -h * .7 + Math.sin(a) * 90 * k + 140 * k * k);
          ctx.rotate(i + k * 4);
          ctx.fillRect(-5, -3, 10, 6);
          ctx.restore();
        }
      }
      break;
    }
    case 'praise-aura': {
      // 飘了: two little hearts bob round the head of someone who has been praised too much.
      const t = e.age ?? 0;
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 2; i++) {
        const a = t * 2.4 + i * Math.PI;
        ctx.save();
        ctx.translate(Math.cos(a) * 26, Math.sin(a) * 6 - 6 + Math.sin(t * 5 + i) * 3);
        ctx.globalAlpha = .75 + Math.sin(a) * .2;
        ctx.fillStyle = '#ff8fd8';
        heartPath(ctx, 7);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'spot-aura': {
      // 主角: a thin spotlight follows the protagonist while the curse holds.
      const t = e.age ?? 0;
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createLinearGradient(-60, 0, 60, 0);
      const s = .16 + Math.sin(t * 6) * .03;
      g2.addColorStop(0, 'rgba(255,214,244,0)');
      g2.addColorStop(.5, `rgba(255,240,250,${s})`);
      g2.addColorStop(1, 'rgba(255,214,244,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(-18, -e.y); ctx.lineTo(18, -e.y); ctx.lineTo(60, 0); ctx.lineTo(-60, 0);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'excuse': {
      // 状态不好，这次不算！: a stopwatch spins backwards round her chest (the last two seconds rewound)
      // and a red 「不算」 seal slams down beside her head.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      const out = Math.min(1, e.life / .2);
      ctx.translate(e.x, e.y);
      // Rewind dial.
      const rr = 74 - Math.min(1, t / .5) * 16;
      ctx.save();
      ctx.globalAlpha = out * .9;
      ctx.strokeStyle = '#bfe3ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a0 = i / 12 * Math.PI * 2;
        const l = i % 3 === 0 ? 10 : 5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr); ctx.lineTo(Math.cos(a0) * (rr - l), Math.sin(a0) * (rr - l)); ctx.stroke();
      }
      const hand = -Math.PI / 2 - t * Math.PI * 5;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hand) * (rr - 14), Math.sin(hand) * (rr - 14)); ctx.stroke();
      // The ↺ arrow riding the rim.
      const arc0 = hand + .4;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, rr + 10, arc0, arc0 + 1.6); ctx.stroke();
      const ax = Math.cos(arc0) * (rr + 10), ay = Math.sin(arc0) * (rr + 10);
      const tx = Math.sin(arc0), ty = -Math.cos(arc0);
      ctx.fillStyle = '#bfe3ff';
      ctx.beginPath(); ctx.moveTo(ax + tx * 12, ay + ty * 12); ctx.lineTo(ax - ty * 8, ay + tx * 8); ctx.lineTo(ax + ty * 8, ay - tx * 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      // The seal.
      const slam = Math.min(1, t / .08);
      const sc = 1.9 - .9 * slam + (t > .08 && t < .16 ? .06 * Math.sin((t - .08) / .08 * Math.PI) : 0);
      ctx.save();
      ctx.translate(dir * 62, -96);
      ctx.rotate(-.16 * dir);
      ctx.scale(sc, sc);
      ctx.globalAlpha = out * (.4 + .6 * slam);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(-25, -33, 50, 66);
      ctx.strokeStyle = '#e02030'; ctx.lineWidth = 4;
      ctx.strokeRect(-25, -33, 50, 66);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-20, -28, 40, 56);
      ctx.fillStyle = '#e02030';
      ctx.font = 'bold 24px "Ma Shan Zheng", KaiTi, STKaiti, "Noto Serif SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('不', 0, -12); ctx.fillText('算', 0, 14);
      ctx.restore();
      if (t > .08 && t < .3) {
        const k = (t - .08) / .22;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(dir * 62, -96, 30 + k * 34, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'rooftop-mark': {
      // 天台是我的: the landing tell. A red target painted on the floor with the four ticks closing in,
      // and a thin danger line from the sky onto it that thickens and blinks as the drop nears.
      const k = e.life / e.max;
      const blink = k < .35 && Math.floor(e.life * 14) % 2 === 0 ? .45 : 1;
      const rad = (e.radius ?? 120) * .8;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= blink;
      const beam = ctx.createLinearGradient(0, -e.y, 0, 0);
      beam.addColorStop(0, 'rgba(255,68,68,0)');
      beam.addColorStop(1, `rgba(255,68,68,${.25 + (1 - k) * .45})`);
      ctx.fillStyle = beam;
      const bw = 2 + (1 - k) * 9;
      ctx.fillRect(-bw / 2, -e.y, bw, e.y);
      ctx.fillStyle = `rgba(255,68,68,${.12 + (1 - k) * .18})`;
      ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * .24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#FF4444';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 0, rad, rad * .24, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, rad * .45, rad * .11, 0, 0, Math.PI * 2); ctx.stroke();
      const close = rad * (.55 + k * .75);
      ctx.lineWidth = 4;
      for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ex = sx * close, ey = sy * close * .24;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + sx * 18, ey + sy * 18 * .24); ctx.stroke();
      }
      break;
    }
    case 'rooftop-dive': {
      // 天台是我的: the drop. Speed lines stream above her as she falls onto the mark.
      ctx.translate(e.x, e.y);
      const p2 = 1 - e.life / e.max;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * 16 + Math.sin(i * 3.1) * 6;
        const len = 160 + (i % 3) * 60;
        const top = -150 - len - p2 * 40;
        const g2 = ctx.createLinearGradient(0, top, 0, -150);
        g2.addColorStop(0, 'rgba(255,255,255,0)');
        g2.addColorStop(1, i % 2 ? 'rgba(255,140,140,.75)' : 'rgba(255,255,255,.85)');
        ctx.strokeStyle = g2;
        ctx.lineWidth = i % 2 ? 2 : 3;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, -150 + (i % 3) * 20); ctx.stroke();
      }
      break;
    }
    case 'rooftop': {
      // 天台是我的: the landing. The floor cracks out from the heel, a flat shockwave runs along it,
      // dust bursts to both sides and chips of concrete hop up and fall.
      const rad = e.radius ?? 120;
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      // Cracks: jagged dark lines lying on the floor, drawn in fully at once and fading slowest.
      ctx.globalAlpha = Math.min(1, e.life / .25) * .85;
      ctx.strokeStyle = '#3a0d12'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const ang = (i / 7) * Math.PI;
        let x = 0, y = 0;
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (let j = 1; j <= 4; j++) {
          x = Math.cos(ang) * rad * .25 * j + Math.sin(i * 7 + j) * 6;
          y = Math.sin(ang) * rad * .05 * j * side + Math.cos(i * 5 + j) * 2;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Shockwave along the floor.
      const q = 1 - (1 - p) * (1 - p);
      ctx.globalAlpha = (1 - p) * .95;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, -2, rad * (.25 + q * 1.1), rad * .18 * (.25 + q * 1.1), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#FF4444'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -2, rad * (.2 + q * .8), rad * .14 * (.2 + q * .8), 0, 0, Math.PI * 2); ctx.stroke();
      // Dust puffs rolling out both ways.
      ctx.fillStyle = '#d9c9cf';
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const d = (40 + i * 26) * q;
        ctx.globalAlpha = (1 - p) * (.55 - i * .12);
        ctx.beginPath(); ctx.arc(side * d, -10 - i * 6, 14 + i * 6 + q * 10, Math.PI, 0); ctx.fill();
      }
      // Chips of concrete on short arcs.
      ctx.fillStyle = '#6b5a60';
      ctx.globalAlpha = 1 - p;
      for (let i = 0; i < 8; i++) {
        const vx = (i - 3.5) * 46;
        const vy = -220 - (i % 3) * 70;
        const cx = vx * t, cy = vy * t + 900 * t * t;
        if (cy < 2) ctx.fillRect(cx - 3, cy - 3, 6, 4 + (i % 2) * 2);
      }
      break;
    }
    case 'howl-ring': {
      // 狼王来了: one beat of the howl — a single thin white circle rolling out to the shove range.
      const rad = e.radius ?? 220;
      const q = 1 - (1 - p) * (1 - p);
      ctx.translate(e.x, e.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = (1 - p) * .85;
      ctx.lineWidth = 2.2 * (1 - p) + .8;
      ctx.beginPath(); ctx.arc(0, 0, rad * (.12 + q * .88), 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'snip-mark': {
      // 剪: a reticle rides the target through the wind-up — brackets turn inward as the window closes.
      const spin = (e.max - e.life) * 5;
      const k = 1 - e.life / e.max;
      const r = (e.radius ?? 60) * (1 - k * .22);
      ctx.translate(e.x, e.y);
      ctx.rotate(spin);
      ctx.globalAlpha *= .85;
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.arc(0, 0, r, .35, 1.2); ctx.stroke();
      }
      ctx.rotate(-spin);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'snip': {
      // 剪: a burst of spindle slashes across the spot — pale violet blades about her height.
      ctx.translate(e.x, e.y);
      const grow = .8 + p * .35;
      const angles = [.5, 2.2, 3.9].map(a => a * (e.dir ?? 1) + p * .5);
      const lens = [186, 150, 168];
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(angles[i]);
        ctx.globalAlpha *= (1 - p) * (1 - i * .12);
        slashSpindle(ctx, lens[i] * grow, 13 - i * 2, i === 0 ? '#efe6ff' : '#d9c7f8', '#241433');
        ctx.restore();
      }
      break;
    }
    case 'violet': {
      // 哭泣的紫罗兰: the petal burst — a soft ring and eight petals tearing outward and fluttering down.
      const r = e.radius ?? 175;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= (1 - p) * .9;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * Math.max(.15, p), 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + .4;
        const t = Math.min(1, p * 1.4 - i * .04);
        if (t <= 0) continue;
        const px = Math.cos(ang) * r * t;
        const py = Math.sin(ang) * r * t - t * 26 + t * t * 44;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + t * 7);
        ctx.globalAlpha = (1 - p) * .8;
        ctx.fillStyle = i % 2 ? e.color : '#e6d4ff';
        ctx.beginPath(); ctx.ellipse(0, 0, 9 * (1 - t * .3), 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'charge-ring': {
      // 剑道三连: the held stance gathers. A wide ring collapses into her as the charge fills,
      // spinning rune ticks and inward motes tightening the read. p is the charge (0 → 1).
      const ease = Math.pow(1 - p, 1.05);
      const R = r * ease;
      const spin = (e.age ?? 0) * 4.2;
      const gather = .34 + p * .52;
      ctx.translate(e.x, e.y);
      ctx.lineCap = 'round';
      ctx.globalAlpha = gather * .62;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 8 + p * 8;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = Math.min(1, gather + .12);
      ctx.strokeStyle = '#f6efff';
      ctx.lineWidth = 2 + p * 2;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const a = -spin * 1.4 + i * Math.PI / 3;
        ctx.globalAlpha = (1 - p) * .9;
        ctx.beginPath(); ctx.arc(Math.cos(a) * R * .82, Math.sin(a) * R * .82, 2.6 * (1 - p) + .8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = Math.min(1, p * 1.3);
      ctx.fillStyle = '#f6efff';
      ctx.beginPath(); ctx.arc(0, 0, 3 + p * 9, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'record': {
      // 录音: the tape rolls — a ring winds down around her with a blinking REC dot.
      const k = 1 - e.life / e.max;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= .9;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(0, 0, 44 + Math.sin(k * 12) * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke();
      ctx.setLineDash([]);
      if (Math.floor(e.life * 6) % 2 === 0) {
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath(); ctx.arc(0, -58, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = `700 11px ${UI_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('REC', 0, -66);
      }
      break;
    }
    case 'fuga-bow': {
      // 火的故事: the void bow condenses — the limbs burn in from nothing while sparks fall inward.
      const k = 1 - e.life / e.max;
      const r = 60 + k * 38;
      const a = Math.min(1, k * 2.2);
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      ctx.globalAlpha *= a;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5 * k + 1;
      ctx.beginPath(); ctx.arc(46, 0, r, Math.PI * .62, Math.PI * 1.38); ctx.stroke();
      ctx.strokeStyle = '#ffd9a8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha *= .8;
      ctx.strokeStyle = '#f3e8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(46 + Math.cos(Math.PI * .62) * r, Math.sin(Math.PI * .62) * r);
      ctx.lineTo(46 + Math.cos(Math.PI * 1.38) * r, Math.sin(Math.PI * 1.38) * r);
      ctx.stroke();
      ctx.fillStyle = '#ffb46a';
      for (let i = 0; i < 6; i++) {
        const t = (k * 2 + i / 6) % 1;
        const px = 46 + Math.cos(1.1 + i) * r * (1 - t) * .8;
        const py = Math.sin(1.1 + i * 2) * r * (1 - t) * .7;
        ctx.globalAlpha = a * t;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      break;
    }
    case 'fuga-burst': {
      // 火的故事: the blast — a twelve-frame sheet played once, drawn at twice the cell.
      const im = images?.get(FUGA_BURST_SRC);
      const size = (e.radius ?? 240) * 2;
      ctx.translate(e.x, e.y);
      if (im?.naturalWidth) {
        const frame = Math.min(11, Math.floor(p * 12));
        const col = frame % 4, row = Math.floor(frame / 4);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = Math.min(1, e.life * 8);
        ctx.drawImage(keyed(im), col * CELL, row * CELL, CELL, CELL, -size / 2, -size / 2, size, size);
      } else {
        ctx.globalAlpha *= (1 - p) * .95;
        ctx.fillStyle = '#ffb46a';
        ctx.beginPath(); ctx.arc(0, 0, size * .18 * (1 - p * .5), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 10 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(0, 0, size * .5 * Math.max(.12, p), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'crown': {
      // 五冠王的威压: an expanding ring carrying five notes — the five crowns ride the wave out.
      ctx.translate(e.x, e.y);
      const rad = Math.max(30, r * (.55 + p * .6));
      ctx.globalAlpha = (1 - p) * .9;
      ctx.lineWidth = 6 - p * 3.5;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + p * 1.2;
        const nx = Math.cos(a) * rad, ny = Math.sin(a) * rad * .55;
        ctx.fillRect(nx - 1.5, ny - 4.4, 3, 6.4);
        ctx.beginPath(); ctx.ellipse(nx - 3, ny + 1, 4.5, 3, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'world-heart': {
      // 此即世界: four hollow hearts pop one after another, each swelling and fading — a slow,
      // readable multi-layer pulse. Young layers ride thick and small, old ones thin and wide.
      ctx.translate(e.x, e.y);
      const t = e.max - e.life;
      const SPAWN = .3, LAYER = .7;
      for (let i = 0; i < 4; i++) {
        const q = (t - i * SPAWN) / LAYER;
        if (q <= 0 || q >= 1) continue;
        const s = 92 * (.35 + .85 * q);
        const w = 6.5 - 3.5 * q;
        ctx.globalAlpha = Math.min(1, q * 7) * (1 - q);
        heartPath(ctx, s);
        ctx.strokeStyle = '#ff5f9e';
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.strokeStyle = '#ffd9ec';
        ctx.lineWidth = w * .45;
        ctx.stroke();
      }
      break;
    }
    case 'poppa': {
      // PoPiPa！: the round-formation ring — a wide circle pops open and five little stars
      // ride it outward, one per member, like everyone called into the circle.
      const r = (e.radius ?? 90) * (.4 + p * .8);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p * .7;
      ctx.strokeStyle = '#fff6ea';
      ctx.lineWidth = 5 * (1 - p) + 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * .38, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r * .8, r * .3, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + p * 1.1;
        const sx = Math.cos(a) * r, sy = Math.sin(a) * r * .38 - 4;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p * 2.4);
        ctx.fillStyle = i % 2 ? '#ffd257' : e.color;
        starPath(ctx, 7 * (1 - p * .4));
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'wish-mark': {
      // 星之鼓动: the landing tell — a star sits in a shrinking floor ring; when the ring
      // closes, the sky answers. Blinking harder as the prayer runs out.
      const k = e.life / e.max;
      const blink = k < .3 && Math.floor(e.life * 10) % 2 === 0 ? .35 : 1;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= .85 * blink;
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 120) * (.55 + k * .45), (e.radius ?? 120) * .16 * (.55 + k * .45), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .5;
      ctx.beginPath(); ctx.ellipse(0, 0, (e.radius ?? 120) * .9, (e.radius ?? 120) * .26, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= blink;
      ctx.fillStyle = '#ffd257';
      ctx.save();
      ctx.translate(0, -34 - k * 26);
      ctx.rotate((1 - k) * 2.4);
      starPath(ctx, 16 + k * 6);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'star-pop': {
      // 小星星: a star burns out where it lands — quick star flare and two spark lines.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.save();
      ctx.rotate(p * 1.6);
      ctx.fillStyle = '#fff3c4';
      starPath(ctx, 16 * (1 - p * .5));
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 2 * (1 - p) + .5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 10, -4);
        ctx.lineTo(side * (22 + p * 22), -12 - p * 14);
        ctx.stroke();
      }
      break;
    }
    case 'star-burst': {
      // 星之鼓动: the landing — a white core flashes, a shock ring races out along the floor,
      // and eight star shards arc outward, spinning, while the column above glows.
      const r = e.radius ?? 190;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life * 5);
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.ellipse(0, 0, r * .3 * (1 - p * .6), r * .12 * (1 - p * .6), 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd257';
      ctx.lineWidth = 9 * (1 - p) + 1.5;
      ctx.beginPath(); ctx.ellipse(0, 6, r * Math.max(.12, p), r * .3 * Math.max(.12, p), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff9a4d';
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 6, r * Math.max(.06, p * .72), r * .2 * Math.max(.06, p * .72), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd257';
      ctx.globalAlpha *= 1 - p;
      ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(10, -110 * (1 - p * .4), 0, -230);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + .35;
        const t = Math.min(1, p * 1.35);
        const sx = Math.cos(ang) * r * .5 * t, sy = Math.sin(ang) * r * .26 * t - t * t * 46;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(t * 6 + i);
        ctx.fillStyle = i % 2 ? '#ffd257' : '#fff3c4';
        starPath(ctx, 12 * (1 - t * .5));
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'hug': {
      // 贴贴: three little hearts pop around the nuzzle, staggered, with a content sparkle.
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const q = (p * 1.4 - i * .18);
        if (q <= 0 || q >= 1) continue;
        const s = 10 + q * 16;
        ctx.save();
        ctx.translate((i - 1) * 16, -q * 34 + i * 6);
        ctx.rotate((i - 1) * .4);
        ctx.globalAlpha = (1 - q) * .85;
        ctx.fillStyle = i === 1 ? '#ff8fb8' : '#ffd0e4';
        heartPath(ctx, s);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha *= 1 - p;
      ctx.fillStyle = '#fff3c4';
      ctx.save();
      ctx.translate(14, -44);
      ctx.rotate(p * 2.2);
      starPath(ctx, 7 * (1 - p * .5));
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'petal-aura': {
      // 花道·缠 / 我可是很脆弱的哦: 友希那的落瓣原样改色。减速为红，白百合为白。
      // 持续期间按 1.1 秒一轮循环，运动读 e.age，不读淡出时钟。
      const t = e.age ?? 0;
      const cycle = 1.1;
      for (let i = 0; i < 6; i++) {
        const u = (t / cycle + i / 6) % 1;
        const fall = u * 150;
        const sway = Math.sin(u * 9) * 14;
        const x = ((i * 41) % 125) - 62;
        const y0 = -63 - (i % 3) * 18;
        ctx.save();
        ctx.translate(e.x + x + sway, e.y + y0 + fall);
        ctx.rotate(Math.sin(u * 9) * .9 + u * 3);
        ctx.globalAlpha = (1 - u) * .9;
        drawPetal(ctx, e.color, e.color === '#ffffff' ? '#e8f2ec' : '#ffb8cf');
        ctx.restore();
      }
      break;
    }
    case 'mitake-guitar': {
      // 不良主唱: three poses on her forward side. Numbers are the tuned layout.
      const pose = MITAKE_POSES[e.col ?? 0] ?? MITAKE_POSES[0];
      const im = images?.get(MITAKE_GUITAR_SRC);
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1;
      ctx.translate(0, pose.y);
      ctx.scale(dir, 1);
      ctx.translate(pose.x, 0);
      ctx.rotate(-(pose.deg * Math.PI / 180) - MITAKE_BODY_ANG + pose.rot);
      if (!im?.naturalWidth || pose.size <= 0) break;
      const dw = pose.size;
      const dh = dw * (im.naturalHeight / im.naturalWidth);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(keyed(im), -MITAKE_GRIP.x / im.naturalWidth * dw, -MITAKE_GRIP.y / im.naturalHeight * dh, dw, dh);
      break;
    }
    case 'guitar-smash': {
      // 不良主唱: the ground shock. The guitar itself is mitake-guitar.
      const rad = (e.radius ?? 90) * 1.7;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, rad * (.3 + p * .7), 15 + p * 13, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd6e0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rad * (.3 + p * .7) * .6, 9 + p * 7, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'as-usual': {
      // 像以前一样: a red sonic ring bursts out of the chest in the screen plane.
      ctx.translate(e.x, e.y);
      ctx.globalAlpha *= 1 - p;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, (e.radius ?? 250) * Math.max(p, .12), 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffd6e0';
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .7;
      ctx.beginPath(); ctx.arc(0, 0, (e.radius ?? 250) * Math.max(p, .12) * .66, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'declaration': {
      // 宣战布告: 此即世界那盏半透明光，改成从画面顶上直落的一根红光。基础色 #EE0022。
      // Glow and pool are translated onto a cached origin so the gradient is not rebuilt per frame.
      const x = e.x;
      const paint = declarationPaint(ctx);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 1 - p;
      ctx.fillStyle = paint.beam;
      ctx.beginPath();
      ctx.moveTo(x - 22, 0);
      ctx.lineTo(x + 22, 0);
      ctx.lineTo(x + 100, FLOOR);
      ctx.lineTo(x - 100, FLOOR);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(x, FLOOR - 88);
      ctx.fillStyle = paint.glow;
      ctx.beginPath();
      ctx.arc(0, 0, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(x, FLOOR);
      ctx.scale(1, .3);
      ctx.fillStyle = paint.pool;
      ctx.beginPath();
      ctx.arc(0, 0, 105, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'fries': {
      // 薯条: a handful is tossed out of the hand one after another, tumbles, sags a little and fades in mid-air.
      // Each fry is one slight bow; the midpoint sits about half of `bend` off the straight line.
      // The melee check already fired. Fall angle ≤ .25 and sag 50 keep every fry ~25 px above the floor.
      const rnd = (n: number) => { const s = Math.sin(n * 12.9898 + e.x * .732) * 43758.5453; return s - Math.floor(s); };
      const bodies = ['#ffd84a', '#ffcc33', '#ffe27a'];
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      for (let i = 0; i < 16; i++) {
        const delay = i / 16 * .25, q = (p - delay) / (1 - delay);
        if (q <= 0) continue;
        const ang = -.6 + rnd(i) * .85, speed = 70 + rnd(i + 31) * 100, out = 1 - (1 - q) * (1 - q);
        const len = 20 + rnd(i + 57) * 12, w = 5 + rnd(i + 83) * 1.5, bend = (rnd(i + 17) - .5) * 18;
        const bow = (x0: number, x1: number, y: number, bulge: number) => {
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.quadraticCurveTo((x0 + x1) / 2, y + bulge, x1, y);
        };
        ctx.save();
        ctx.translate(Math.cos(ang) * speed * out, Math.sin(ang) * speed * out + 50 * q * q);
        ctx.rotate(ang + (rnd(i + 97) - .5) * 1.2 + (rnd(i + 113) - .5) * 1.6 * q);
        ctx.globalAlpha = Math.min(1, q * 8, (1 - q) / .55);
        ctx.lineCap = 'round';
        bow(-len / 2, len / 2, 0, bend); ctx.strokeStyle = '#c47a1a'; ctx.lineWidth = w + 2; ctx.stroke();
        bow(-len / 2, len / 2, 0, bend); ctx.strokeStyle = bodies[i % 3]; ctx.lineWidth = w; ctx.stroke();
        bow(-len / 2, len / 2, w * .12, bend); ctx.strokeStyle = '#eeb02c'; ctx.lineWidth = w * .35; ctx.stroke();
        bow(-len / 2 + 2, len / 2 - 2, -w * .22, bend * .6); ctx.strokeStyle = '#fff4b0'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#dc922a'; ctx.beginPath(); ctx.arc(len / 2, 0, w * .42, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'metronome': {
      // 忧伤节拍器: one small note at the strum. A ring grows from the note head and fades, so four strums read as ripples.
      ctx.translate(e.x, e.y);
      ctx.scale(e.dir ?? 1, 1);
      const grow = 6 + p * (e.radius ?? 52);
      ctx.save();
      ctx.globalAlpha = (1 - p) * .9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#d6f4ff';
      ctx.beginPath();
      ctx.arc(-2, 6, grow, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = Math.min(1, (1 - p) * 2);
      ctx.fillStyle = '#7ec8ff';
      ctx.beginPath();
      ctx.ellipse(-2, 6, 9, 6, -.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d6f4ff';
      ctx.fillRect(5, -16, 3, 20);
      break;
    }
    case 'skip-wake': {
      // 打水漂: the faint wake the stone leaves on the water between two touches; the older end fades first.
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y - 1);
      const g = ctx.createLinearGradient(-dir * r, 0, dir * r, 0);
      g.addColorStop(0, 'rgba(207,232,255,0)');
      g.addColorStop(1, `rgba(207,232,255,${.65 * (1 - p)})`);
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
      break;
    }
    case 'skip-splash': {
      // 打水漂: the stone meets the water right under her feet. A pale sheen spreads flat, two rings open
      // across it and a few drops hop up and fall back; the touch that ends the run adds a crown of spray.
      const t = e.max - e.life;
      const heavy = !!e.heavy;
      const ease = 1 - (1 - p) * (1 - p);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .34;
      ctx.fillStyle = '#cfe8ff';
      ctx.beginPath(); ctx.ellipse(0, -1, r * (.45 + ease * .55), r * .19 * (.45 + ease * .55), 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 2; k++) {
        const q = Math.max(0, Math.min(1, (p - k * .16) / (1 - k * .16)));
        if (q <= 0) continue;
        const qe = 1 - (1 - q) * (1 - q);
        ctx.globalAlpha = (1 - q) * (k ? .6 : .95);
        ctx.strokeStyle = k ? e.color : '#f2f9ff';
        ctx.lineWidth = (k ? 2 : 3.2) * (1 - q) + .8;
        ctx.beginPath(); ctx.ellipse(0, -1, r * (.3 + qe * .7), r * .2 * (.3 + qe * .7), 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = '#e8f6ff';
      ctx.globalAlpha = (1 - p) * .95;
      const drops = heavy ? 9 : 5, dr = heavy ? 3.2 : 2.6;
      ctx.beginPath();
      for (let i = 0; i < drops; i++) {
        const side = i - (drops - 1) / 2;
        const vx = side * (heavy ? 34 : 30), vy = -(heavy ? 250 : 170) - (i % 3) * 36 + Math.abs(side) * 14;
        const cx = vx * t, cy = vy * t + 1100 * t * t;
        if (cy >= 0) continue;
        ctx.moveTo(cx + dr, cy - 2); ctx.arc(cx, cy - 2, dr, 0, Math.PI * 2);
      }
      ctx.fill();
      if (heavy && p < .55) {
        const k = p / .55;
        ctx.strokeStyle = '#f2f9ff'; ctx.lineWidth = 2;
        ctx.globalAlpha = (1 - k) * .9;
        for (let i = 0; i < 7; i++) {
          const ang = -Math.PI / 2 + (i - 3) * .32;
          const rr = 30 * Math.sin(k * Math.PI);
          ctx.beginPath(); ctx.moveTo(Math.cos(ang) * 12, -2 + Math.sin(ang) * 4); ctx.lineTo(Math.cos(ang) * (12 + rr * .9), -2 + Math.sin(ang) * (4 + rr)); ctx.stroke();
        }
      }
      break;
    }
    case 'skip-die': {
      // 打水漂: a small die beside her head counts the hops. The last face holds a beat; an odd one tumbles
      // away (the throw comes back fast), a five rings out in her colour.
      const t = e.max - e.life;
      const pips = Math.max(1, Math.min(5, e.n ?? 1));
      const last = !!e.hit, odd = !!e.heavy;
      const pop = Math.min(1, t / .06);
      const half = 11 * (.75 + .25 * pop);
      const out = last ? Math.min(1, e.life / .25) : 1;
      ctx.translate(e.x, e.y);
      if (odd && t > .3) {
        const k = (t - .3) / Math.max(.01, e.max - .3);
        ctx.translate(0, -k * 18);
        ctx.rotate(k * Math.PI * 1.5);
      }
      ctx.globalAlpha = out * .92;
      ctx.fillStyle = '#fbfcff';
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-half, -half, half * 2, half * 2, 4); else ctx.rect(-half, -half, half * 2, half * 2);
      ctx.fill(); ctx.stroke();
      const o = half * .52;
      ctx.fillStyle = odd && t > .3 ? '#9fa3ff' : e.color;
      for (const [x, y] of DIE_PIPS[pips]) { ctx.beginPath(); ctx.arc(x * o, y * o, 2.2, 0, Math.PI * 2); ctx.fill(); }
      if (last && t < .22) {
        // The result: one thin ring breathes out from the face; a five rings in her colour, a touch wider.
        const k = t / .22;
        const five = pips === 5;
        ctx.globalAlpha = (1 - k) * (five ? .85 : .6);
        ctx.strokeStyle = five ? e.color : '#ffffff'; ctx.lineWidth = five ? 2 : 1.2;
        ctx.beginPath(); ctx.arc(0, 0, half + 4 + k * (five ? 16 : 10), 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'skip-spout': {
      // 打水漂 five: the knockdown throws up a short column of water under the body.
      const t = e.max - e.life;
      const rise = Math.sin(Math.min(1, p * 1.6) * Math.PI);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .75;
      const h = r * 2.2 * rise;
      const g = ctx.createLinearGradient(0, 0, 0, -h);
      g.addColorStop(0, 'rgba(207,232,255,.85)');
      g.addColorStop(1, 'rgba(207,232,255,0)');
      ctx.fillStyle = g;
      const w = 15;
      ctx.beginPath(); ctx.moveTo(-w, 0);
      ctx.bezierCurveTo(-w * .55, -h * .35, -w * .7, -h * .8, 0, -h);
      ctx.bezierCurveTo(w * .7, -h * .8, w * .55, -h * .35, w, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2f3ff';
      for (let i = 0; i < 6; i++) {
        const vx = (i - 2.5) * 34, vy = -260 - (i % 3) * 40;
        const cx = vx * t, cy = vy * t + 1100 * t * t;
        if (cy < 0) { ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case 'moon-reach': {
      // 把月亮扣下来: a thin pale crescent hangs over the raised hand for a breath, then dims.
      const dir = e.dir ?? 1;
      const inn = Math.min(1, p / .2), fade = Math.min(1, (1 - p) / .5);
      ctx.translate(e.x, e.y - p * 8);
      ctx.globalAlpha = inn * fade * .85;
      ctx.fillStyle = e.color;
      // Crescent = the disc minus a second disc nudged toward her front; clipped, so nothing else is cut.
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.rect(-12, -12, 24, 24); ctx.arc(dir * 5, -3, 10, 0, Math.PI * 2);
      ctx.fill('evenodd');
      ctx.restore();
      ctx.globalAlpha = inn * fade * .7;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      const g0 = 3 + 3 * Math.sin(p * Math.PI);
      ctx.beginPath(); ctx.moveTo(-dir * 16 - g0, -10); ctx.lineTo(-dir * 16 + g0, -10); ctx.moveTo(-dir * 16, -10 - g0); ctx.lineTo(-dir * 16, -10 + g0); ctx.stroke();
      break;
    }
    case 'dunk-streak': {
      // 把月亮扣下来: the drop. Three thin lines run from where they were caught down to the floor.
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = e.color;
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 14;
        const top = r * p * (.5 + i * .15);
        ctx.globalAlpha = (1 - p) * (i === 1 ? .8 : .45);
        ctx.lineWidth = i === 1 ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, r * (.85 + i * .05)); ctx.stroke();
      }
      break;
    }
    case 'dunk': {
      // 把月亮扣下来: the landing. A hoop rim lies flat for an instant and sinks, a white shock runs along
      // the floor and a little dust lifts at both sides. Held back a beat so it meets the body.
      const t = e.max - e.life - .05;
      if (t < 0) break;
      const k = Math.min(1, t / (e.max - .05));
      const q = 1 - (1 - k) * (1 - k);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - k) * .9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5 * (1 - k) + .8;
      ctx.beginPath(); ctx.ellipse(0, -2, r * (.4 + q * 1.1), r * .14 * (.4 + q * 1.1), 0, 0, Math.PI * 2); ctx.stroke();
      if (k < .55) {
        const m = k / .55;
        ctx.globalAlpha = (1 - m) * .85;
        ctx.strokeStyle = e.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(0, -4 + m * 4, r * .42, r * .1, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#f2efe8'; ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(i * r * .16, -4 + m * 4); ctx.lineTo(i * r * .1, 10 * (1 - m)); ctx.stroke();
        }
      }
      ctx.fillStyle = '#d8d2da';
      for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = (1 - k) * (.28 - i * .1);
        ctx.beginPath(); ctx.ellipse(side * (r * .55 + i * 24) * (.5 + q), -3 - i * 2, 14 + i * 6 + q * 10, 5 + i * 2, 0, Math.PI, 0); ctx.fill();
      }
      break;
    }
    case 'dunk-lift': {
      // 把月亮扣下来 on the floor: two thin chevrons rise off the chest as the body goes up.
      ctx.translate(e.x, e.y - p * 46);
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        ctx.globalAlpha = (1 - p) * (i ? .45 : .8);
        const y = i * 14;
        ctx.beginPath(); ctx.moveTo(-r * .45, y + 10); ctx.lineTo(0, y - 4); ctx.lineTo(r * .45, y + 10); ctx.stroke();
      }
      break;
    }
    case 'candy-crunch': {
      // 稍好一些的地狱: a lollipop at her lips. The swirl head snaps on the bite; a few crumbs drop and the bare
      // stick stays a moment longer.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const bite = .16;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-dir * 3, 2); ctx.lineTo(dir * 13, 6); ctx.stroke();
      const hx = dir * 19, hy = 3;
      if (t < bite) {
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffe6d6'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let a0 = 0; a0 < Math.PI * 3.2; a0 += .3) {
          const rr = 1 + a0 * .6;
          const x = hx + Math.cos(a0) * rr, y = hy + Math.sin(a0) * rr;
          if (a0 === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        const k = (t - bite) / Math.max(.01, e.max - bite);
        if (k < .25) {
          // The flash of the crack, once.
          ctx.globalAlpha = (1 - k / .25) * .9;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
          for (let i = 0; i < 4; i++) {
            const a0 = i * Math.PI / 2 + .4;
            ctx.beginPath(); ctx.moveTo(hx + Math.cos(a0) * 5, hy + Math.sin(a0) * 5); ctx.lineTo(hx + Math.cos(a0) * 11, hy + Math.sin(a0) * 11); ctx.stroke();
          }
        }
        const tt = t - bite;
        for (let i = 0; i < 5; i++) {
          const vx = dir * (20 + i * 14) * (i % 2 ? 1 : -.4), vy = -60 - i * 18;
          const cx = hx + vx * tt, cy = hy + vy * tt + 700 * tt * tt;
          ctx.globalAlpha = (1 - k) * .9;
          ctx.fillStyle = CANDY_CRUMBS[i];
          ctx.fillRect(Math.round(cx) - 1.5, Math.round(cy) - 1.5, 3 + (i % 2), 3);
        }
      }
      break;
    }
    case 'numb': {
      // 稍好一些的地狱: the shoulder. Three short streaks trail behind it and one dull arc meets whatever it hits —
      // muted on purpose: nothing about this move is supposed to feel bright.
      const dir = e.dir ?? 1;
      const q = 1 - (1 - p) * (1 - p);
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = '#c3c8d8'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      // Behind her back, not across the chest: the effect sits ahead of the shoulder, so step back past the body.
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * 16 + 6;
        const len = (28 - Math.abs(i - 1) * 8) * (1 - p);
        ctx.globalAlpha = (1 - p) * .6;
        ctx.beginPath(); ctx.moveTo(-dir * (92 + q * 18), y); ctx.lineTo(-dir * (92 + q * 18 + len), y); ctx.stroke();
      }
      ctx.globalAlpha = (1 - p) * (e.hit ? .85 : .5);
      ctx.strokeStyle = e.hit ? '#e6e9f4' : '#9aa1b8'; ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath();
      const rr = r * (.5 + q * .5);
      if (dir > 0) ctx.arc(-rr * .55, 0, rr, -.75, .75); else ctx.arc(rr * .55, 0, rr, Math.PI - .75, Math.PI + .75);
      ctx.stroke();
      break;
    }
    case 'pat': {
      // 精准踩雷: the kind little pat — a soft halo on the shoulder and three small hearts lifting off it.
      const dir = e.dir ?? 1;
      const q = easeOut(p);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .8;
      ctx.strokeStyle = '#bff8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 12 + q * 22, 6 + q * 10, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const k = Math.max(0, Math.min(1, p * 1.4 - i * .15));
        ctx.globalAlpha = (1 - k) * .95;
        heart(ctx, dir * (-6 + i * 10) + Math.sin(k * 6 + i) * 4, -10 - k * 46, 4 + i, '#ff8fc8');
      }
      break;
    }
    case 'kind-bubble': {
      // 精准踩雷: what she says pops out as a speech bubble with a heart in it; the heart then drops in an
      // arc onto their feet — the kind words land where the mine comes up.
      const tx = e.tx ?? 0, ty = e.ty ?? 0;
      ctx.translate(e.x, e.y);
      if (p < .35) {
        const k = backOut(Math.min(1, p / .2));
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(Math.sign(tx) * 18, -22);
        ctx.scale(k, k);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#151222'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-Math.sign(tx) * 6, 10); ctx.lineTo(-Math.sign(tx) * 14, 20); ctx.lineTo(-Math.sign(tx) * 1, 12); ctx.closePath(); ctx.fill();
        heart(ctx, 0, 1, 6, '#ff5f9e');
        ctx.restore();
        break;
      }
      const k = (p - .35) / .65;
      const x = Math.sign(tx) * 18 + (tx - Math.sign(tx) * 18) * k;
      const y = -22 + (ty + 22) * k - Math.sin(k * Math.PI) * 60;
      for (let i = 1; i <= 4; i++) {
        const kk = Math.max(0, k - i * .07);
        ctx.globalAlpha = .35 * (1 - i / 5);
        heart(ctx, Math.sign(tx) * 18 + (tx - Math.sign(tx) * 18) * kk, -22 + (ty + 22) * kk - Math.sin(kk * Math.PI) * 60, 5, '#ffc2df');
      }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(k * 5); heart(ctx, 0, 0, 7, '#ff5f9e'); ctx.restore();
      break;
    }
    case 'mine': {
      // 精准踩雷: the heart lands and a mine springs up out of the floor — a round dark shell in her
      // colour band with a heart lamp that blinks faster and faster, a white fuse ring running out
      // around it and the floor under it glowing red.
      const t = e.max - e.life;
      const show = .16;
      if (t < show) break;
      const lt = t - show, span = Math.max(.05, e.max - show), u = Math.min(1, lt / span);
      const pop = backOut(Math.min(1, lt / .07));
      ctx.translate(e.x, e.y);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
      glow.addColorStop(0, `rgba(255,70,90,${.25 + .35 * u})`); glow.addColorStop(1, 'rgba(255,70,90,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(0, 0, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.scale(1 + (1 - pop) * .3, pop);
      ctx.fillStyle = '#23242f';
      ctx.beginPath(); ctx.ellipse(0, 0, 25, 20, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = e.tint ?? '#77FFFF';
      ctx.fillRect(-25, -7, 50, 4);
      ctx.fillStyle = '#4a4e63'; ctx.fillRect(-28, -2, 56, 4);
      ctx.strokeStyle = '#0d0c14'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, 0, 25, 20, 0, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#9aa0b8';
      for (const rx of [-16, -6, 6, 16]) ctx.fillRect(rx - 1, -12 + Math.abs(rx) * .25, 2, 2);
      const blink = Math.sin(lt * (16 + lt * 120)) > -.1;
      ctx.globalAlpha = blink ? 1 : .35;
      heart(ctx, 0, -24, 6, blink ? '#ff3b5c' : '#7a1f30');
      if (blink) { ctx.globalAlpha = .3; ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(0, -24, 13, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.globalAlpha = .9;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, -14, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u)); ctx.stroke();
      if (u > .4) {
        ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#151222'; ctx.lineWidth = 3;
        ctx.font = `bold 20px ${UI_FONT}`; ctx.textAlign = 'center';
        for (const s of [-1, 1]) {
          const bob = Math.sin(lt * 40 + s) * 2;
          ctx.strokeText('!', s * 44, -26 + bob); ctx.fillText('!', s * 44, -26 + bob);
        }
      }
      break;
    }
    case 'mine-boom': {
      // 精准踩雷: a comic blast — a white flash, a jagged orange star with an ink outline, a shock ring on
      // the floor, a mushroom of smoke, broken-heart shards and a big 嘭！. Every buff it set off
      // cracks one more cyan bolt out of the smoke.
      const n = e.n ?? 0;
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      if (t < .06) {
        ctx.globalAlpha = 1 - t / .06;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, -r * .6, r * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      const q = easeOut(Math.min(1, p * 2.2));
      ctx.globalAlpha = Math.max(0, 1 - p * 1.3) * .9;
      ctx.strokeStyle = '#ffd59a'; ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 3 * q, r * .4 * q, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a0 = -Math.PI / 2 + (i - 3) * .32;
        const rise = r * (.6 + q * 1.3) + (i % 2) * 12;
        ctx.globalAlpha = Math.max(0, .55 - p * .5);
        ctx.fillStyle = i % 2 ? '#6d6878' : '#8a8496';
        ctx.beginPath(); ctx.arc(Math.cos(a0) * r * .5 * q, -rise + Math.sin(a0) * 8, 14 + q * 18, 0, Math.PI * 2); ctx.fill();
      }
      const burst = backOut(Math.min(1, t / .14)) * (1 - Math.max(0, p - .45) / .55);
      if (burst > 0) {
        ctx.save();
        ctx.translate(0, -r * .6);
        ctx.rotate(t * 1.5);
        ctx.globalAlpha = 1;
        jag(ctx, r * 1.25 * burst, r * .75 * burst, 12);
        ctx.fillStyle = '#ff7a2f'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#2a1408'; ctx.stroke();
        jag(ctx, r * .85 * burst, r * .5 * burst, 12);
        ctx.fillStyle = '#ffd23f'; ctx.fill();
        ctx.fillStyle = '#fffbe0';
        ctx.beginPath(); ctx.arc(0, 0, r * .3 * burst, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#8ff6ff'; ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i - (n - 1) / 2) * .55;
        const len = r * (1.4 + q * .8);
        ctx.globalAlpha = Math.max(0, 1 - p * 1.6);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -r * .6);
        for (let k = 1; k <= 4; k++) {
          const d = len * k / 4, wob = (k % 2 ? 1 : -1) * 10;
          ctx.lineTo(Math.cos(a0) * d + Math.cos(a0 + Math.PI / 2) * wob, -r * .6 + Math.sin(a0) * d + Math.sin(a0 + Math.PI / 2) * wob);
        }
        ctx.stroke();
      }
      const shards = 6 + n * 3;
      for (let i = 0; i < shards; i++) {
        const a0 = -Math.PI * .1 - (i / shards) * Math.PI * .8 + Math.sin(i * 7.3) * .2;
        const v = r * (2 + (i % 3) * .6);
        const x = Math.cos(a0) * v * p, y = -r * .6 + Math.sin(a0) * v * p + 380 * p * p;
        ctx.globalAlpha = Math.max(0, 1 - p * 1.1);
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (8 + i)); halfHeart(ctx, 6, i % 2 ? '#ff5f9e' : '#ffc2df', i % 2 === 0); ctx.restore();
      }
      const pop = backOut(Math.min(1, t / .12));
      ctx.globalAlpha = Math.min(1, e.life / .2);
      comic(ctx, '嘭！', r * .2, -r * 1.9, (30 + n * 4) * pop, '#ffe14a', -.18);
      break;
    }
    case 'oni-beans': {
      // 恶鬼退散: 「恶鬼～滚出去！」 — a fistful of roasted beans flung past the palm, bouncing once on the way down.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      for (let i = 0; i < 7; i++) {
        const vx = dir * (150 + i * 38), vy = -(110 + (i % 3) * 70);
        const x = vx * t, y = vy * t + 900 * t * t;
        ctx.save();
        ctx.translate(x, Math.min(y, 110 - (i % 2) * 8));
        ctx.rotate(t * (6 + i));
        ctx.fillStyle = '#e2b25a'; ctx.strokeStyle = '#7a5520'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 3.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff0c4';
        ctx.beginPath(); ctx.arc(-1.2, -1.2, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (e.hit && t < .3) comic(ctx, '福！', dir * 34, -30 - t * 40, 22 * backOut(Math.min(1, t / .1)), '#ffcf4a', dir * .2);
      break;
    }
    case 'piggy-sweat': {
      // 我背你！: the rider, carried off whether they like it or not — a sweat drop and flailing marks.
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .15);
      const flip = Math.floor(t * 12) % 2 ? 1 : -1;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y = 34 + i * 16;
        ctx.beginPath(); ctx.moveTo(flip * (34 + i * 3), y); ctx.lineTo(flip * (48 + i * 5), y - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-flip * (30 + i * 3), y + 6); ctx.lineTo(-flip * (44 + i * 5), y); ctx.stroke();
      }
      ctx.fillStyle = e.color;
      const dy = (t * 40) % 18;
      ctx.beginPath(); ctx.moveTo(22, -2 + dy); ctx.quadraticCurveTo(29, 9 + dy, 22, 12 + dy); ctx.quadraticCurveTo(15, 9 + dy, 22, -2 + dy); ctx.fill();
      break;
    }
    case 'piggy-toss': {
      // 我背你！: set down hard — dust thrown both ways and a flat star of impact lines.
      const q = easeOut(p);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#e9dcc4';
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        const k = Math.floor(i / 2);
        ctx.beginPath(); ctx.ellipse(side * (18 + q * (30 + k * 22)), -8 - k * 6 - q * 10, 10 + k * 3, 7 + k * 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 3 * (1 - p) + 1; ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const a0 = Math.PI + (i / 6) * Math.PI;
        ctx.beginPath(); ctx.moveTo(Math.cos(a0) * r * .3, Math.sin(a0) * r * .3 - 20); ctx.lineTo(Math.cos(a0) * r * (.5 + q * .5), Math.sin(a0) * r * (.5 + q * .5) - 20); ctx.stroke();
      }
      break;
    }
    case 'hug-heart': {
      // 爱之拥抱: one heart per squeeze, each bigger than the last; the last one bursts into a ring of little ones.
      const n = e.n ?? 0;
      const t = e.max - e.life;
      const size = 9 + n * 5;
      ctx.translate(e.x, e.y - p * 26);
      if (!e.hit || t < .14) {
        const k = backOut(Math.min(1, t / .12));
        ctx.globalAlpha = Math.min(1, e.life / .2);
        ctx.save(); ctx.scale(k, k);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        heartPath(ctx, size); ctx.stroke();
        ctx.fillStyle = e.color; heartPath(ctx, size); ctx.fill();
        ctx.fillStyle = '#ffe0ea'; ctx.beginPath(); ctx.arc(-size * .4, -size * .45, size * .18, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        break;
      }
      const k = easeOut((t - .14) / Math.max(.01, e.max - .14));
      ctx.globalAlpha = 1 - k;
      for (let i = 0; i < 9; i++) {
        const a0 = i * Math.PI * 2 / 9 - Math.PI / 2;
        ctx.save();
        ctx.translate(Math.cos(a0) * (14 + k * 62), Math.sin(a0) * (14 + k * 62));
        ctx.rotate(a0 + Math.PI / 2);
        ctx.fillStyle = i % 2 ? '#ff8fb8' : e.color;
        heartPath(ctx, 7 + (i % 3)); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'hug-squeeze': {
      // 爱之拥抱: the squeeze — two pink brackets clamp in round the pair, tighter on every beat.
      const n = e.n ?? 0;
      const q = easeOut(p);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .9;
      ctx.strokeStyle = e.color; ctx.lineWidth = 3 + n; ctx.lineCap = 'round';
      const w = r * (1.4 - q * .45);
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.arc(-side * w * .2, 0, w, side > 0 ? -.55 : Math.PI - .55, side > 0 ? .55 : Math.PI + .55); ctx.stroke();
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(side * (w + 14), i * 14); ctx.lineTo(side * (w + 4 - q * 6), i * 12); ctx.stroke();
        }
      }
      break;
    }
    case 'hug-soul': {
      // 爱之拥抱: hugged too hard — a little white soul slips out of the top of their head and wobbles up.
      const t = e.max - e.life;
      ctx.translate(e.x + Math.sin(t * 9) * 6, e.y - t * 46);
      ctx.globalAlpha = Math.min(1, e.life / .3) * .92;
      const k = backOut(Math.min(1, t / .15));
      ctx.scale(k, k);
      ctx.fillStyle = e.color; ctx.strokeStyle = '#9aa6c8'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-11, 2);
      ctx.bezierCurveTo(-11, -16, 11, -16, 11, 2);
      ctx.quadraticCurveTo(10, 12, 2, 16);
      ctx.quadraticCurveTo(-1, 22, 6, 28);
      ctx.quadraticCurveTo(-8, 24, -9, 12);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a5270';
      ctx.fillRect(-6, -4, 3, 2); ctx.fillRect(3, -4, 3, 2);
      ctx.beginPath(); ctx.arc(0, 3, 2.2, 0, Math.PI); ctx.fill();
      break;
    }
    case 'meal-bowl': {
      // 我开动了！: after the palms, a heaped bowl of white rice comes up to her mouth and goes down in three
      // big mouthfuls, the chopsticks working, steam off the top.
      const dir = e.dir ?? 1;
      const local = (e.max - e.life) - (e.t0 ?? 0);
      if (local < 0) break;
      const span = Math.max(.1, e.max - (e.t0 ?? 0) - .12);
      const eaten = Math.min(3, Math.floor(local / span * 3));
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = Math.min(1, local / .06, e.life / .1);
      // Steam.
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const phase = (local * 1.6 + i * .33) % 1;
        ctx.globalAlpha = Math.min(1, local / .06, e.life / .1) * (1 - phase) * .8;
        const x0 = -8 + i * 8;
        ctx.beginPath(); ctx.moveTo(x0, -16 - phase * 30);
        ctx.quadraticCurveTo(x0 + 5, -22 - phase * 30, x0, -28 - phase * 30); ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, local / .06, e.life / .1);
      // The rice: 「我大方地煮了五碗米！」 — a mountain taller than her head, one tier gone per mouthful.
      const heap = MEAL_HEAP[eaten];
      const wide = 16 + heap * .12;
      ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#cfc6b0'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-wide, -2);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const x = -wide + u * wide * 2;
        const y = -2 - Math.sin(u * Math.PI) * heap - Math.sin(u * Math.PI * 7) * 1.6;
        ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e9e1cc';
      for (let i = 0; i < 9; i++) {
        const u = .12 + (i * .37) % .76;
        const x = -wide + u * wide * 2;
        const y = -2 - Math.sin(u * Math.PI) * heap * ((i * .53) % .8 + .1);
        ctx.beginPath(); ctx.ellipse(x, y, 2.2, 1.2, i, 0, Math.PI * 2); ctx.fill();
      }
      // The bowl.
      ctx.fillStyle = '#c4473a'; ctx.strokeStyle = '#3a1612'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-17, -2); ctx.quadraticCurveTo(-15, 14, 0, 15); ctx.quadraticCurveTo(15, 14, 17, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f2d9a0'; ctx.fillRect(-6, 13, 12, 3);
      // Chopsticks, scooping on every mouthful.
      const scoop = Math.sin((local / span * 3) * Math.PI * 2) * .25;
      ctx.save();
      ctx.translate(10, -6);
      ctx.rotate(-.9 + scoop);
      ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -30); ctx.moveTo(4, 1); ctx.lineTo(5, -29); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'piggy-siren': {
      // 我背你！ (band story 1, 「必须马上去医院！」): a little emergency light on her head for the whole run,
      // red and white turning, with the 嘀嘟 popping out on each side in turn.
      const t = e.max - e.life;
      const k = backOut(Math.min(1, t / .1));
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .1);
      ctx.scale(k, k);
      const spin = t * 14;
      // Beams: two soft wedges sweeping round.
      for (let i = 0; i < 2; i++) {
        const ang = spin + i * Math.PI;
        const front = Math.cos(ang);
        ctx.save();
        ctx.globalAlpha *= .22 + Math.max(0, front) * .3;
        ctx.fillStyle = i ? '#ffffff' : e.color;
        ctx.beginPath(); ctx.moveTo(0, -10);
        ctx.lineTo(Math.sin(ang) * 70 - 14, -10 - 18); ctx.lineTo(Math.sin(ang) * 70 + 14, -10 + 18); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#3a3a44'; ctx.strokeStyle = '#151222'; ctx.lineWidth = 2;
      ctx.fillRect(-11, -2, 22, 6); ctx.strokeRect(-11, -2, 22, 6);
      const red = Math.floor(t * 8) % 2 === 0;
      ctx.fillStyle = red ? e.color : '#ffd4d4';
      ctx.beginPath(); ctx.arc(0, -2, 9, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.ellipse(-3, -6, 2.4, 1.4, -.5, 0, Math.PI * 2); ctx.fill();
      const side = Math.floor(t * 4) % 2 ? 1 : -1;
      comic(ctx, Math.floor(t * 4) % 2 ? '嘟' : '嘀', side * 30, -18, 15, '#ff6a6a', side * .2);
      break;
    }
    case 'piggy-heart': {
      // 我背你！ (蓬咲: 「心脏都要被吓得蹦出来了！」): the rider's heart thumps out of their chest, each beat
      // quicker than the last.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      // Beat phase: the period shrinks from .34s to .12s over the run.
      const period = .34 - .22 * Math.min(1, t / Math.max(.1, e.max));
      const beat = (t % period) / period;
      const pump = beat < .25 ? Math.sin(beat / .25 * Math.PI) : 0;
      ctx.translate(e.x + dir * pump * 6, e.y);
      ctx.globalAlpha = Math.min(1, t / .08, e.life / .12);
      const size = 9 + pump * 5;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
      heartPath(ctx, size); ctx.stroke();
      ctx.fillStyle = e.color; heartPath(ctx, size); ctx.fill();
      if (pump > .2) {
        ctx.strokeStyle = '#ffd0dc'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (const sgn of [-1, 1]) {
          ctx.beginPath(); ctx.arc(0, 0, size + 6 + pump * 4, sgn > 0 ? -.6 : Math.PI - .6, sgn > 0 ? .6 : Math.PI + .6); ctx.stroke();
        }
      }
      break;
    }
    case 'meal-cooker': {
      // 我开动了！: the rice cooker pops up beside her — 叮♪, the lid flips up, steam. One time in ten it
      // blows instead (家团最能炸的就是电饭锅): a black puff, the lid flying, the pot left scorched.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      const boom = !!e.hit;
      const pop = backOut(Math.min(1, t / .1));
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .15);
      ctx.save();
      ctx.scale(dir * pop, pop);
      const burnt = boom && t > .1;
      // Body.
      ctx.fillStyle = burnt ? '#5a524c' : e.color; ctx.strokeStyle = '#151222'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-24, -26); ctx.quadraticCurveTo(0, -32, 24, -26); ctx.lineTo(22, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = burnt ? '#3a3430' : '#c9c3b6'; ctx.fillRect(-23, -16, 46, 5);
      ctx.fillStyle = burnt ? '#222' : '#ff9a3c'; ctx.beginPath(); ctx.arc(14, -8, 2.6, 0, Math.PI * 2); ctx.fill();
      // Lid: flips open on the ding, or flies off on the boom.
      const open = boom ? 0 : Math.min(1, Math.max(0, (t - .05) / .1));
      ctx.save();
      if (boom && t > .1) {
        const u = t - .1;
        ctx.translate(-30 * u * 6, -26 - 260 * u + 600 * u * u);
        ctx.rotate(-u * 14);
        ctx.translate(0, 26);
      } else {
        ctx.translate(-22, -26);
        ctx.rotate(-open * 1.2);
        ctx.translate(22, 26);
      }
      ctx.fillStyle = burnt ? '#4a423c' : e.color;
      ctx.beginPath(); ctx.moveTo(-24, -26); ctx.quadraticCurveTo(0, -42, 24, -26); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a756c'; ctx.fillRect(-4, -38, 8, 4);
      ctx.restore();
      ctx.restore();
      if (!boom) {
        // Steam out of the open pot.
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const ph = ((t - .08) * 1.4 + i * .3) % 1;
          if (t < .08) break;
          ctx.globalAlpha = Math.min(1, e.life / .15) * (1 - ph) * .85;
          const x0 = (i - 1) * 9;
          ctx.beginPath(); ctx.moveTo(x0, -34 - ph * 40); ctx.quadraticCurveTo(x0 + 6, -42 - ph * 40, x0, -50 - ph * 40); ctx.stroke();
        }
      } else if (t > .08) {
        // The blast: grey-black puffs rolling up and out.
        const u = Math.min(1, (t - .08) / .45);
        for (let i = 0; i < 7; i++) {
          const a0 = -Math.PI / 2 + (i - 3) * .45;
          const d = 14 + easeOut(u) * (30 + (i % 3) * 12);
          ctx.globalAlpha = Math.min(1, e.life / .15) * (1 - u) * .85;
          ctx.fillStyle = i % 2 ? '#3a3633' : '#6b6560';
          ctx.beginPath(); ctx.arc(Math.cos(a0) * d, -24 + Math.sin(a0) * d, 9 + u * 10, 0, Math.PI * 2); ctx.fill();
        }
        if (u < .3) {
          ctx.globalAlpha = (1 - u / .3) * .9;
          ctx.fillStyle = '#ffd25a';
          jag(ctx, 30, 14, 9); ctx.fill();
        }
      }
      break;
    }
    case 'meal-soot': {
      // 我开动了！ after the blow-up: soot on her face and a curl of smoke off her hair. She eats anyway.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = Math.min(1, t / .1, e.life / .4) * .8;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(2, 4, 6, 3.4, .3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-8, -2, 4, 2.6, -.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, -8, 3, 2, .5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,114,108,.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const ph = (t * .9) % 1;
      ctx.globalAlpha *= 1 - ph;
      ctx.beginPath(); ctx.moveTo(-6, -30 - ph * 26); ctx.quadraticCurveTo(0, -36 - ph * 26, -6, -42 - ph * 26); ctx.quadraticCurveTo(-12, -48 - ph * 26, -6, -54 - ph * 26); ctx.stroke();
      break;
    }
    case 'meal-grain': {
      // 我开动了！: one grain of rice left stuck at the corner of her mouth.
      const t = e.max - e.life;
      ctx.translate(e.x, e.y + Math.sin(t * 5) * 1);
      ctx.globalAlpha = Math.min(1, t / .08, e.life / .3);
      ctx.fillStyle = e.color; ctx.strokeStyle = '#b8ad94'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 1.9, .5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    }
    case 'meal-timer': {
      // 我开动了！: a little bowl over her head; the rice in it goes down with the buff's clock, and the bowl
      // blinks through the last second.
      const k = e.life / e.max;
      const blink = e.life < 1 && Math.floor(e.life * 8) % 2 === 0;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, (e.max - e.life) / .15) * (blink ? .35 : .95);
      const heap = 2 + k * 9;
      ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#cfc6b0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, -1, 9.5, heap, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4473a'; ctx.strokeStyle = '#151222'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-11, -1); ctx.quadraticCurveTo(-9, 9, 0, 10); ctx.quadraticCurveTo(9, 9, 11, -1); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'meal-steam': {
      // 我开动了！: full and fired up — a little warm puff rises off her now and then while the buff holds.
      ctx.translate(e.x, e.y - p * 34);
      ctx.globalAlpha = (1 - p) * .7;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const x0 = (i ? 7 : -7);
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0 + 6, -6, x0, -12); ctx.quadraticCurveTo(x0 - 6, -18, x0, -24); ctx.stroke();
      }
      break;
    }
    case 'meal-done': {
      // 我开动了！: the last mouthful — a warm orange ring and a scatter of grains.
      const q = easeOut(p);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (.4 + q * .8), r * (.3 + q * .5), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fffdf6';
      for (let i = 0; i < 10; i++) {
        const a0 = i * Math.PI * 2 / 10;
        ctx.save(); ctx.translate(Math.cos(a0) * r * q, Math.sin(a0) * r * q * .7); ctx.rotate(a0);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      break;
    }
    case 'family-member': {
      // 上吧，My Family！: one of the four, coming out of the door of light behind 蕾叶 on her own move —
      // 千樱梨 flips over, 蓬咲 peeks then bolts, 宁月 hops high and drops, 心玖 blinks through. Sized to her
      // real height, washed in her colour with the art faintly through, stretched along her motion with a
      // short trail of afterimages, squashed on every strike, then lifting away as motes of light.
      const n = e.n ?? 0;
      const m = FAMILY_MEMBERS[n];
      const dir = e.dir ?? 1;
      const local = (e.max - e.life) - (e.t0 ?? 0);
      if (!m || local < 0) break;
      const door = -(e.radius ?? 140);
      const h = 179 * m.cm / RAIKA_CM;
      const im = images?.get(FAMILY_SRC);
      const S1 = m.enter + (m.strikes[m.strikes.length - 1] - m.strikes[0]);
      // Afterimages while she is moving fast. The body pose is kept and painted once below;
      // lite keeps only the freshest ghost, the same cut the fighter trails already make.
      const now = familyPose(n, local, door, FAMILY_POSE[0]);
      const before = familyPose(n, local - 1 / 60, door, FAMILY_POSE[1]);
      const moving = Math.hypot(now.x - before.x, now.y - before.y) * 60 > 300;
      if (moving) for (let k = liteFx ? 1 : 3; k >= 1; k--) {
        const u = local - k * .028;
        paintFamilyAt(ctx, im, n, m.color, h, dir, e.x, e.y, familyPose(n, u, door, FAMILY_POSE[2]), familyPose(n, u - 1 / 60, door, FAMILY_POSE[3]), .32 / k, true);
      }
      // 心玖's blink: the streak of the cut, from where she vanished to where she stands.
      if (n === 3 && local >= m.enter * .55 && local < m.enter + .18) {
        const k = Math.min(1, (local - m.enter * .55) / .05);
        const fade = local < m.enter ? 1 : 1 - (local - m.enter) / .18;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = m.color; ctx.lineWidth = 7; ctx.lineCap = 'round';
        const y0 = e.y - h * .55;
        const x0 = e.x + dir * (door + 8), x1 = e.x + dir * (door + 8 + (84 - door - 8) * k);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
        ctx.restore();
      }
      // The glow on the floor under her, weaker the higher she is.
      ctx.save();
      ctx.globalAlpha = now.a * .45 * Math.max(0, 1 - now.y / 180);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.ellipse(e.x + dir * now.x, e.y, 34, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      paintFamilyAt(ctx, im, n, m.color, h, dir, e.x, e.y, now, before, 1, false);
      // Dissolving: motes of her colour drift up off where she stood.
      const fadeT = local - (S1 + FAMILY_HOLD);
      if (fadeT > 0) {
        const k = Math.min(1, fadeT / FAMILY_LINGER);
        ctx.save();
        for (let i = 0; i < 12; i++) {
          const px = e.x + dir * (now.x + ((i * 37) % 44) - 22) + Math.sin(fadeT * 7 + i) * 4;
          const py = e.y - now.y - h * (.15 + ((i * .17) % .75)) - fadeT * (70 + (i % 3) * 30);
          ctx.globalAlpha = (1 - k) * .9;
          ctx.fillStyle = i % 3 === 0 ? '#ffffff' : m.color;
          const r0 = 2.6 - (i % 3) * .5;
          ctx.fillRect(px - r0, py - r0, r0 * 2, r0 * 2);
        }
        ctx.restore();
      }
      break;
    }
    case 'family-hit': {
      // 上吧，My Family！: every blow lands under a burst of manga focus lines and a ring in her colour, on
      // top of her own signature — 千樱梨 a drum head that booms, 蓬咲 a bass wave rolling out along the
      // floor, 宁月 a whole row of keys slammed down from above, 心玖 one clean cut that splits a beat later.
      const n = e.n ?? 0;
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const q = easeOut(p);
      ctx.translate(e.x, e.y);
      // Common: the white core and the focus lines.
      if (t < .07) {
        ctx.globalAlpha = 1 - t / .07;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, 26 + t * 300, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = Math.max(0, 1 - p * 1.6);
      for (let i = 0; i < 20; i++) {
        const a0 = i * Math.PI * 2 / 20 + (i % 2) * .08;
        const r0 = r * (1.1 + (i % 3) * .2 + q * .5), r1 = r0 + r * (.9 + (i % 4) * .25);
        ctx.strokeStyle = i % 3 ? '#ffffff' : e.color; ctx.lineWidth = i % 2 ? 2 : 3.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); ctx.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1); ctx.stroke();
      }
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = e.color; ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (.5 + q * 1.4), 0, Math.PI * 2); ctx.stroke();
      if (n === 0) {
        // The drum head: a skin with its tension rods, booming out twice.
        for (let ring = 0; ring < 2; ring++) {
          const k = Math.max(0, q - ring * .25);
          ctx.globalAlpha = (1 - p) * (ring ? .6 : .9);
          ctx.strokeStyle = '#ffd6ea'; ctx.lineWidth = 4 - ring * 2;
          ctx.beginPath(); ctx.ellipse(0, 0, r * (.9 + k * .9), r * (.9 + k * .9) * .92, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = e.color; ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const a0 = i * Math.PI / 4;
          const rr = r * (.9 + q * .9);
          ctx.beginPath(); ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr * .92); ctx.lineTo(Math.cos(a0) * (rr + 10), Math.sin(a0) * (rr + 10) * .92); ctx.stroke();
        }
        comic(ctx, '咚！', dir * 34, -60, 30 * backOut(Math.min(1, t / .1)), e.color, dir * .18);
      } else if (n === 1) {
        // The bass: a low wave racing out both ways along the floor, and the ground cracking under them.
        ctx.translate(0, 92);
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = e.color; ctx.lineWidth = 4;
        const reach = 60 + q * 280;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          for (let x = 0; x <= reach; x += 6) {
            const amp = 18 * (1 - x / (reach + 1)) * (1 - p);
            const y = -Math.abs(Math.sin(x * .07 - t * 40)) * amp;
            if (x === 0) ctx.moveTo(side * x, y); else ctx.lineTo(side * x, y);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = '#1d3a3a'; ctx.lineWidth = 2.5;
        for (let i = 0; i < 5; i++) {
          const a0 = Math.PI + .3 + i * .6;
          const len = (30 + (i % 2) * 22) * Math.min(1, t / .08);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * len, Math.sin(a0) * len * .25 + 2); ctx.stroke();
        }
        comic(ctx, '嗡！', -dir * 40, -128, 26 * backOut(Math.min(1, t / .1)), e.color, -dir * .15);
      } else if (n === 2) {
        // The keys: a full octave slammed down from above, notes bursting off the impact.
        const drop = Math.min(1, t / .1);
        for (let i = 0; i < 7; i++) {
          const x = (i - 3) * 22;
          const y = -240 + drop * 196;
          ctx.globalAlpha = 1 - Math.max(0, p - .3) / .7;
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = e.color; ctx.lineWidth = 2;
          ctx.fillRect(x - 10, y - 70, 20, 76); ctx.strokeRect(x - 10, y - 70, 20, 76);
          if (i < 6 && i !== 2) { ctx.fillStyle = '#2a2440'; ctx.fillRect(x + 4, y - 70, 12, 44); }
        }
        if (t > .1) {
          const k = (t - .1) / Math.max(.01, e.max - .1);
          ctx.fillStyle = e.color;
          for (let i = 0; i < 6; i++) {
            const a0 = -Math.PI / 2 + (i - 2.5) * .45;
            const d = 20 + easeOut(k) * 90;
            ctx.globalAlpha = 1 - k;
            note(ctx, Math.cos(a0) * d, -30 + Math.sin(a0) * d, i % 2 ? '#ffffff' : e.color);
          }
        }
      } else {
        // The cut: a thin line first; a beat later it splits open into a bright band and shards.
        ctx.scale(dir, 1);
        ctx.rotate(-.42);
        const len = r * 5;
        if (t < .12) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
        } else {
          const k = (t - .12) / Math.max(.01, e.max - .12);
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = e.color;
          const w = 16 * (1 - k) + 2;
          ctx.fillRect(-len / 2, -w / 2, len, w);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-len / 2, -1.5, len, 3);
          for (let i = 0; i < 8; i++) {
            const sx = (i - 3.5) * 22;
            const side = i % 2 ? 1 : -1;
            ctx.save();
            ctx.translate(sx, side * (8 + easeOut(k) * 40));
            ctx.rotate(i);
            ctx.fillStyle = i % 3 ? '#e6fbff' : e.color;
            ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
            ctx.restore();
          }
        }
      }
      break;
    }
    case 'family-finale': {
      // 上吧，My Family！: 蕾叶's own strum — a huge orange crescent, focus lines, and five rays in the five
      // colours driving into the point.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const q = easeOut(p);
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      if (t < .08) {
        ctx.globalAlpha = 1 - t / .08;
        ctx.fillStyle = '#fff4e0';
        ctx.beginPath(); ctx.arc(0, 0, 40 + t * 600, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1 - p;
      const cols = [e.color, ...FAMILY_MEMBERS.map(m => m.color)];
      ctx.lineCap = 'round';
      cols.forEach((c, i) => {
        const a0 = Math.PI - .9 + i * .45;
        const rr = r * (2.2 - q * 1.4);
        ctx.strokeStyle = c; ctx.lineWidth = 9 * (1 - p) + 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr); ctx.lineTo(Math.cos(a0) * (rr + 90), Math.sin(a0) * (rr + 90)); ctx.stroke();
      });
      for (let i = 0; i < 24; i++) {
        const a0 = i * Math.PI * 2 / 24;
        const r0 = r * (.9 + q * .6), r1 = r0 + r * (.8 + (i % 3) * .3);
        ctx.strokeStyle = i % 2 ? '#ffffff' : e.color; ctx.lineWidth = i % 2 ? 2 : 4;
        ctx.beginPath(); ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); ctx.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1); ctx.stroke();
      }
      ctx.strokeStyle = e.color; ctx.lineWidth = 22 * (1 - p) + 4;
      ctx.beginPath(); ctx.arc(-30, 10, r * (.8 + q * .35), -1.5, 1); ctx.stroke();
      ctx.strokeStyle = '#fff4e0'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(-30, 10, r * (.8 + q * .35), -1.5, 1); ctx.stroke();
      ctx.strokeStyle = e.color; ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.beginPath(); ctx.arc(0, 0, r * (.6 + q * 1.8), 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'family-dim': {
      // 上吧，My Family！: the house lights go down while the family is out — a dark wash, darkest at the
      // edges, so the light of the door and their glow carry. Screen space, behind every body.
      const t = e.max - e.life;
      const fade = Math.min(1, t / .15) * Math.min(1, e.life / .3);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(11,8,20,.38)';
      ctx.fillRect(0, 0, W, H);
      const g0 = ctx.createRadialGradient(W / 2, H * .6, H * .3, W / 2, H * .6, W * .7);
      g0.addColorStop(0, 'rgba(11,8,20,0)');
      g0.addColorStop(1, 'rgba(11,8,20,.5)');
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'family-door': {
      // 上吧，My Family！: their Home — a door of warm light under a little house roof swings open behind
      // her, light spilling across the floor toward them. It flares each time one of them steps through,
      // and swings shut after the last.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const open = Math.min(1, t / .18) * Math.min(1, e.life / .25);
      const W0 = 66, H0 = 150;
      let flare = 0;
      for (const m of FAMILY_MEMBERS) {
        const v = (t - (m.strikes[0] - m.enter)) / .07;
        flare = Math.max(flare, Math.exp(-v * v));
      }
      ctx.translate(e.x, e.y);
      // Light on the floor, thrown forward.
      ctx.globalAlpha = open * (.28 + flare * .2);
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath();
      ctx.moveTo(-W0 / 2, 0); ctx.lineTo(W0 / 2, 0);
      ctx.lineTo(dir * 260 + W0, 14); ctx.lineTo(dir * 260 - W0 * 1.6, 14); ctx.closePath(); ctx.fill();
      // Rays out of the doorway.
      for (let i = 0; i < 6; i++) {
        const a0 = -Math.PI / 2 + (i - 2.5) * .32 + Math.sin(t * 2 + i) * .04;
        ctx.globalAlpha = open * (.12 + flare * .2);
        ctx.fillStyle = '#fff1cf';
        ctx.beginPath(); ctx.moveTo(-6, -H0 * .6); ctx.lineTo(6, -H0 * .6);
        ctx.lineTo(Math.cos(a0) * 320 + 18, -H0 * .6 + Math.sin(a0) * 320); ctx.lineTo(Math.cos(a0) * 320 - 18, -H0 * .6 + Math.sin(a0) * 320); ctx.closePath(); ctx.fill();
      }
      // The doorway: bright inside, brightest in the middle.
      ctx.globalAlpha = open;
      ctx.fillStyle = '#ffc978';
      ctx.fillRect(-W0 / 2, -H0, W0, H0);
      ctx.fillStyle = '#fff6e2';
      ctx.globalAlpha = open * (.7 + flare * .3);
      ctx.fillRect(-W0 / 2 + 8, -H0 + 10, W0 - 16, H0 - 10);
      // Two panels swinging open (narrowing toward the frame).
      const pw = W0 / 2 * (1 - open);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#5a3a24'; ctx.strokeStyle = '#2a1810'; ctx.lineWidth = 2;
      if (pw > .5) {
        ctx.fillRect(-W0 / 2, -H0, pw, H0); ctx.strokeRect(-W0 / 2, -H0, pw, H0);
        ctx.fillRect(W0 / 2 - pw, -H0, pw, H0); ctx.strokeRect(W0 / 2 - pw, -H0, pw, H0);
      }
      // Frame and roof: a house, drawn in her colour.
      ctx.globalAlpha = Math.min(1, t / .12) * Math.min(1, e.life / .25);
      ctx.strokeStyle = e.color; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      ctx.strokeRect(-W0 / 2 - 4, -H0 - 4, W0 + 8, H0 + 4);
      ctx.beginPath(); ctx.moveTo(-W0 / 2 - 22, -H0 - 4); ctx.lineTo(0, -H0 - 46); ctx.lineTo(W0 / 2 + 22, -H0 - 4); ctx.stroke();
      if (flare > .05) {
        // The step through: the doorway itself flashes white, with a thin halo round the frame.
        ctx.globalAlpha = flare * .55;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-W0 / 2, -H0, W0, H0);
        ctx.globalAlpha = flare * .35;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.strokeRect(-W0 / 2 - 10 - flare * 6, -H0 - 10 - flare * 6, W0 + 20 + flare * 12, H0 + 10 + flare * 6);
      }
      break;
    }
    case 'family-photo': {
      // 上吧，My Family！ the finale: a camera flash, 咔嚓, and a family photo snaps round the five of them —
      // 蕾叶 in front, the four behind her — a white frame with the band's name on the caption strip.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const pop = backOut(Math.min(1, t / .14));
      const fade = Math.min(1, e.life / .3);
      const cx = e.x - dir * 98, cy = e.y - 124;
      const fw = 370, fh = 236;
      ctx.translate(cx, cy);
      ctx.rotate(-dir * .045);
      ctx.scale(1.25 - .25 * pop, 1.25 - .25 * pop);
      ctx.globalAlpha = fade * Math.min(1, t / .06);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.lineJoin = 'miter';
      ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-fw / 2 - 6, fh / 2 - 2, fw + 12, 38);
      ctx.fillStyle = '#2a1a10';
      ctx.font = `900 20px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('一家Dumb Rock!', 0, fh / 2 + 17);
      // The flash inside the frame, gone in an instant.
      if (t < .14) {
        ctx.globalAlpha = (1 - t / .14) * .85 * fade;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
      }
      ctx.globalAlpha = fade;
      comic(ctx, '咔嚓！', fw / 2 - 30, -fh / 2 - 6, 24 * backOut(Math.min(1, t / .1)), '#ffffff', dir * .12);
      break;
    }
    case 'family-zone': {
      // 上吧，My Family！ zone: nobody caught, so the patch of ground the family pound is marked — a warm
      // ring on the floor that pulses on every beat until the strum.
      const t = e.max - e.life;
      const beat = .5 + .5 * Math.cos(t * Math.PI * 2 / .3);
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, t / .12, e.life / .2) * (.35 + beat * .25);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * .22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, t / .12, e.life / .2) * .8;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + beat * .06), r * .22 * (1 + beat * .06), 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'family-lineup': {
      // 上吧，My Family！: after the strum the four stand in a row behind her for a beat, then fade.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const a = Math.min(1, t / .15) * Math.min(1, e.life / .3);
      const im = images?.get(FAMILY_SRC);
      for (let i = FAMILY_MEMBERS.length - 1; i >= 0; i--) {
        const m = FAMILY_MEMBERS[i];
        const h = 179 * m.cm / RAIKA_CM;
        const x = e.x - dir * (74 + i * 44);
        ctx.save();
        ctx.globalAlpha = a * .4;
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.ellipse(x, e.y, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(x, e.y);
        ctx.scale(dir, 1);
        drawFamilySilhouette(ctx, im, i, 2, h, m.color, a * .85);
        ctx.restore();
      }
      break;
    }
    case 'oops': {
      // 精准踩雷: afterwards she has no idea — a round thought bubble with a big ？ and a sweat drop.
      const t = e.max - e.life;
      const k = backOut(Math.min(1, t / .15));
      ctx.translate(e.x, e.y + Math.sin(t * 6) * 2);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.save(); ctx.scale(k, k);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#151222'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-12, 16, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a7bd8'; ctx.font = `bold 22px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('？', 1, 1);
      ctx.restore();
      ctx.fillStyle = '#8fd0ff';
      ctx.beginPath(); ctx.moveTo(22, -6 + t * 18); ctx.quadraticCurveTo(28, 4 + t * 18, 22, 6 + t * 18); ctx.quadraticCurveTo(16, 4 + t * 18, 22, -6 + t * 18); ctx.fill();
      break;
    }
    case 'slap': {
      // 绝不退场: the sting of both palms — nothing over her face. A white-gold shock ring spreads from
      // her head, comic impact flares spit out of both sides, the blush hatch lands on her cheek, 啪！.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      const ring = easeOut(Math.min(1, t / .25));
      ctx.globalAlpha = Math.max(0, 1 - t / .3);
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 4 * (1 - ring) + 1;
      ctx.beginPath(); ctx.ellipse(-dir * 8, -6, 24 + ring * 46, 18 + ring * 34, 0, 0, Math.PI * 2); ctx.stroke();
      const flare = backOut(Math.min(1, t / .07)) * Math.max(0, 1 - t / .28);
      if (flare > 0) {
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const a0 = (side > 0 ? 0 : Math.PI) + (i - 1.5) * .32;
            const r0 = 22, r1 = 22 + (16 + (i % 2) * 12) * flare;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = i % 2 ? '#ffffff' : '#ffe14a'; ctx.lineWidth = 3.5 - (i % 2);
            ctx.beginPath(); ctx.moveTo(-dir * 8 + Math.cos(a0) * r0, -6 + Math.sin(a0) * r0); ctx.lineTo(-dir * 8 + Math.cos(a0) * r1, -6 + Math.sin(a0) * r1); ctx.stroke();
          }
        }
      }
      const pop = backOut(Math.min(1, t / .1));
      ctx.globalAlpha = Math.min(1, e.life / .15);
      blush(ctx, 0, 6, 1.15 * pop, dir);
      comic(ctx, '啪！', -dir * 44, -34, 24 * pop, '#ffffff', -dir * .2);
      break;
    }
    case 'slap-flash': {
      // 绝不退场: the sting — the edges of the screen flush red for a beat. Screen space.
      const fade = 1 - p;
      const g0 = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .65);
      g0.addColorStop(0, 'rgba(255,40,70,0)');
      g0.addColorStop(1, `rgba(255,40,70,${.38 * fade})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'unbowed-shout': {
      // 绝不退场: 不甘心——！ as manga shout lettering — each glyph slams in, white into red with a thick ink
      // edge, the whole line shaking hard and settling; red ink streaks drag behind it and jagged
      // shout rings roll out of her mouth.
      const dir = e.dir ?? 1;
      const t = e.max - e.life;
      const text = '不甘心——！';
      const glyphs = [...text];
      const shake = Math.max(0, 1 - t / .5) * 5;
      ctx.translate(e.x + Math.sin(t * 90) * shake, e.y + Math.cos(t * 77) * shake);
      ctx.globalAlpha = Math.min(1, e.life / .3);
      ctx.strokeStyle = '#ff3b5c'; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const y = -8 + i * 7, len = 60 + i * 24;
        ctx.globalAlpha = Math.min(1, e.life / .3) * (.5 - i * .1) * Math.min(1, t / .2);
        ctx.lineWidth = 4 - i * .6;
        ctx.beginPath(); ctx.moveTo(-dir * 70, y); ctx.lineTo(-dir * (70 + len), y + i * 2); ctx.stroke();
      }
      const size = 30;
      const total = glyphs.length * size * .82;
      glyphs.forEach((ch, i) => {
        const at0 = i * .035;
        if (t < at0) return;
        const k = backOut(Math.min(1, (t - at0) / .1));
        const x = -total / 2 + i * size * .82 + size * .4;
        ctx.save();
        ctx.translate(dir > 0 ? x : -x, Math.sin(i * 1.7) * 3);
        ctx.rotate((i % 2 ? .06 : -.06));
        ctx.scale(k * (i === 0 ? 1.25 : 1), k * (i === 0 ? 1.25 : 1));
        ctx.globalAlpha = Math.min(1, e.life / .3);
        ctx.font = `900 ${size}px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8; ctx.strokeStyle = '#1e0610'; ctx.strokeText(ch, 0, 0);
        const fill = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
        fill.addColorStop(0, '#ffffff'); fill.addColorStop(.55, '#ff8a9a'); fill.addColorStop(1, '#e0213f');
        ctx.fillStyle = fill; ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
      ctx.strokeStyle = '#ffd0d8';
      for (let i = 0; i < 3; i++) {
        const k = Math.min(1, Math.max(0, (t - i * .08) / .45));
        if (k <= 0 || k >= 1) continue;
        ctx.globalAlpha = (1 - k) * .8;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const rr = 20 + k * 120;
        for (let a = -.9; a <= .9; a += .15) {
          const jr = rr + (Math.round(a / .15) % 2 ? 6 : -6);
          const x = dir * (14 + Math.cos(a) * jr), y = 95 + Math.sin(a) * jr * .7;
          if (a === -.9) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'unbowed-wind': {
      // 绝不退场: the cold night wind off the sea, from behind her and on past her — long pale ribbons
      // that curl as they go, sea spray in them, and a skin of foam sliding along the floor.
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const y = (i - 5) * 18 + Math.sin(i * 2.3) * 8;
        const k = Math.min(1, p * 1.5 + i * .02);
        const head = -r * .9 + r * 2.4 * easeOut(k);
        const len = 80 + (i % 3) * 40;
        const curl = Math.sin(i * 1.3 + p * 6) * 14;
        const a = (1 - p) * (.35 + (i % 2) * .3);
        ctx.strokeStyle = '#dcf5ff'; ctx.lineWidth = 2 + (i % 3);
        ctx.globalAlpha = a * .35;
        ctx.beginPath(); ctx.moveTo(dir * (head - len), y); ctx.quadraticCurveTo(dir * (head - len * .7), y + curl * .6, dir * (head - len * .45), y + curl * .5); ctx.stroke();
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.moveTo(dir * (head - len * .45), y + curl * .5); ctx.quadraticCurveTo(dir * (head - len * .2), y + curl * .2, dir * head, y - curl * .4); ctx.stroke();
      }
      ctx.fillStyle = '#e8f8ff';
      for (let i = 0; i < 16; i++) {
        const k = Math.min(1, p * 1.3 + (i % 5) * .04);
        const x = dir * (-r * .7 + r * 2.1 * k + Math.sin(i * 5.1) * 30);
        const y = (i - 8) * 11 - k * 24 * ((i % 3) - 1);
        ctx.globalAlpha = (1 - p) * .7;
        ctx.fillRect(Math.round(x), Math.round(y), 2 + (i % 2), 2 + (i % 2));
      }
      const fy = 96;
      ctx.globalAlpha = (1 - p) * .55;
      const fx0 = dir * (-r * .8 + r * 2 * easeOut(p));
      const foam = ctx.createLinearGradient(fx0 - dir * 160, 0, fx0, 0);
      foam.addColorStop(0, 'rgba(180,230,255,0)'); foam.addColorStop(1, 'rgba(230,248,255,.9)');
      ctx.fillStyle = foam;
      ctx.beginPath(); ctx.ellipse(fx0 - dir * 80, fy, 80, 5, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'slap-aura': {
      // 绝不退场, held: the blush hatch stays on her cheek. From the first stack a 斗气 aura climbs her
      // body — thin red-pink streaks rising from her feet past her head, embers drifting up with
      // them — denser and taller with every stack; the anger mark throbs by her head. The full-stack
      // rim on her silhouette is drawn by the renderer from the sprite itself.
      const dir = e.dir ?? 1;
      const n = e.n ?? 0;
      const age = e.age ?? 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = .85;
      blush(ctx, 0, 6, .85, dir);
      ctx.restore();
      if (n > 0) {
        const feet = e.y + 150;
        const height = 150 + n * 22;
        const count = 3 + n * 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < count; i++) {
          const seed = i * 2.399;
          const x = e.x + Math.sin(seed * 3.1) * (22 + n * 2);
          const speed = .9 + (i % 3) * .3;
          const k = (age * speed + i / count) % 1;
          const len = 26 + (i % 4) * 12 + n * 4;
          const y = feet - k * height;
          const a = Math.sin(k * Math.PI) * (.45 + n * .08);
          const sway = Math.sin(age * 3 + seed) * 3;
          ctx.lineWidth = 2 + (i % 2);
          ctx.globalAlpha = a * .45; ctx.strokeStyle = '#ff3c5a';
          ctx.beginPath(); ctx.moveTo(x + sway * .4, y + len * .4); ctx.lineTo(x + sway, y + len); ctx.stroke();
          ctx.globalAlpha = a; ctx.strokeStyle = '#ffbec8';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sway * .4, y + len * .4); ctx.stroke();
        }
        for (let i = 0; i < 2 + n * 2; i++) {
          const k = (age * .7 + i * .29) % 1;
          const x = e.x + Math.sin(i * 4.7 + age * 2) * (30 + k * 10);
          const y = feet - 20 - k * (height + 20);
          ctx.globalAlpha = Math.sin(k * Math.PI) * .9;
          ctx.fillStyle = i % 2 ? '#ffd2a8' : '#ff6f87';
          ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2 + (i % 2), 2 + (i % 2));
        }
        ctx.restore();
        const throb = 1 + Math.max(0, Math.sin(age * 9)) * .25;
        ctx.globalAlpha = 1;
        angerMark(ctx, e.x + dir * 26, e.y - 34, (6 + n) * throb);
      }
      break;
    }
    case 'unbowed-stack': {
      // One more hit taken: the anger mark pops and a burst of spirit streaks jumps up off her.
      const t = e.max - e.life;
      const k = backOut(Math.min(1, t / .1));
      ctx.globalAlpha = 1 - p;
      angerMark(ctx, e.x + 18, e.y - 6, 12 * k);
      ctx.strokeStyle = '#ffc2cc'; ctx.lineCap = 'round'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const x = e.x + (i - 2.5) * 12;
        const y = e.y + 30 - p * 70 - (i % 2) * 10;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 24 * (1 - p)); ctx.stroke();
      }
      break;
    }
    case 'burden':
    case 'burden-rise': {
      // 一肩扛下: everything she carries, stacked on her head — the lyric book flat at the bottom, the bass
      // across it, the mic standing on top. The tower sways, more at the top. `n` is how many are left;
      // they come off from the top. On the cast they drop out of the sky one after another and land.
      const rise = e.type === 'burden-rise';
      const n = rise ? 3 : (e.n ?? 0);
      const t = e.max - e.life;
      const age = e.age ?? t;
      ctx.translate(e.x, e.y);
      if (!rise) {
        ctx.globalAlpha = .55;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 22, 4); ctx.lineTo(s * 30, 10); ctx.stroke(); }
      }
      for (let i = 0; i < n; i++) {
        let y = BURDEN_STACK[i];
        let squash = 1;
        if (rise) {
          const t0 = i * .1, t1 = t0 + .13;
          if (t < t0) continue;
          if (t < t1) y = BURDEN_STACK[i] - 150 * (1 - ((t - t0) / (t1 - t0)) ** 2);
          else {
            const k = Math.min(1, (t - t1) / .1);
            squash = 1 - Math.sin(k * Math.PI) * .25;
            if (k < 1) {
              ctx.globalAlpha = 1 - k;
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
              for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 26, y); ctx.lineTo(s * (40 + k * 10), y - 6); ctx.stroke(); }
            }
          }
        }
        const sway = Math.sin(age * 2.6) * (i + 1) * 1.8;
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(sway, y);
        ctx.rotate(Math.sin(age * 2.6 + .5) * .04 * (i + 1));
        ctx.scale(1 / Math.sqrt(squash), squash);
        drawBurdenItem(ctx, i, e.color);
        ctx.restore();
      }
      break;
    }
    case 'burden-break': {
      // One of them gives: an impact star where it sat, and it flies off the top of the pile, spinning,
      // cracked, shedding bits.
      const i = Math.max(0, Math.min(2, e.n ?? 0));
      const t = e.max - e.life;
      ctx.translate(e.x, e.y + BURDEN_STACK[i]);
      const burst = backOut(Math.min(1, t / .06)) * Math.max(0, 1 - p * 2);
      if (burst > 0) {
        ctx.globalAlpha = 1;
        jag(ctx, 30 * burst, 16 * burst, 8);
        ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      ctx.globalAlpha = 1 - p;
      ctx.save();
      ctx.translate(70 * p, -80 * p + 260 * p * p);
      ctx.rotate(p * 9);
      drawBurdenItem(ctx, i, e.color);
      ctx.strokeStyle = '#151222'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-1, 0); ctx.lineTo(-5, 4); ctx.lineTo(7, 8); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = e.color;
      for (let k = 0; k < 6; k++) {
        const a0 = k * 1.05 + .4;
        ctx.fillRect(Math.round(Math.cos(a0) * 40 * p), Math.round(Math.sin(a0) * 20 * p + 140 * p * p), 3, 3);
      }
      break;
    }
    case 'burden-collapse': {
      // The last one goes and so does her voice: a grey scribble cloud with ……, a broken quaver sinking
      // out of it.
      const t = e.max - e.life;
      const k = backOut(Math.min(1, t / .15));
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = Math.min(1, e.life / .3);
      ctx.save(); ctx.scale(k, k);
      ctx.fillStyle = '#5a5866'; ctx.strokeStyle = '#2a2833'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.05) * 16, Math.sin(i * 1.05) * 9, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#d8d6e2';
      for (let i = 0; i < 3; i++) ctx.fillRect(-10 + i * 8, -1, 4, 4);
      ctx.restore();
      ctx.save();
      ctx.translate(26, 10 + t * 30);
      ctx.rotate(.3 + t);
      ctx.fillStyle = '#c9cfe0'; ctx.strokeStyle = '#c9cfe0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(-5, 9, 6, 4.5, -.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -12); ctx.lineTo(8, -6); ctx.stroke();
      ctx.strokeStyle = '#1a1528'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(4, 2); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'quake-ready': {
      // Carried to the end: the pile turns gold and sinks into her as three gold rings dropping to her feet.
      ctx.translate(e.x, e.y);
      for (let i = 0; i < 3; i++) {
        const k = Math.max(0, Math.min(1, (p - i * .12) / .6));
        if (k <= 0) continue;
        ctx.globalAlpha = (1 - k) * .9;
        ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, BURDEN_STACK[i] + k * (BURDEN_Y - BURDEN_STACK[i]), 26 + k * 14, 7 + k * 4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = Math.max(0, 1 - p * 2) * .6;
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath(); ctx.arc(0, -20, 26 * (1 - p), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'quake-aura': {
      // Aftershocks waiting at her feet: a slowly turning ring that ripples like a bass waveform,
      // with one glowing bead circling per charge.
      const n = Math.max(1, e.n ?? 1);
      const age = e.age ?? 0;
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      for (let ring = 0; ring < 2; ring++) {
        ctx.globalAlpha = .55 - ring * .2;
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + .01; a += .12) {
          const rr = 40 + ring * 12 + Math.sin(a * 8 + age * (6 + ring * 3)) * 3;
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr * .26;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let i = 0; i < n; i++) {
        const a = age * 2.2 + i * Math.PI * 2 / n;
        ctx.globalAlpha = .95;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(Math.cos(a) * 46, Math.sin(a) * 12, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = .35; ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 46, Math.sin(a) * 12, 8, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'quake': {
      // The aftershocks land: a sub-bass shock through the target — expanding rings, a waveform line
      // across them that dies away, and cracks in the floor under them. One more beat per charge.
      const n = Math.max(1, e.n ?? 1);
      ctx.translate(e.x, e.y);
      for (let i = 0; i <= n; i++) {
        const k = Math.max(0, Math.min(1, p * 1.4 - i * .12));
        if (k <= 0) continue;
        ctx.globalAlpha = (1 - k) * .85;
        ctx.strokeStyle = i % 2 ? '#ffffff' : e.color; ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(0, 0, r * (.4 + k * 1.8), r * (.4 + k * 1.8) * .7, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = -150; x <= 150; x += 4) {
        const amp = 26 * (1 - p) * Math.exp(-Math.abs(x) / 90);
        const y = Math.sin(x * .12 + p * 30) * amp;
        if (x === -150) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = '#2a2240'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 5 + n; i++) {
        const a0 = (i / (5 + n)) * Math.PI;
        const len = 30 + (i % 3) * 18;
        ctx.beginPath(); ctx.moveTo(0, 85); ctx.lineTo(Math.cos(a0) * len * Math.min(1, p * 4), 85 + Math.sin(a0) * 6); ctx.stroke();
      }
      break;
    }
    case 'encore-stage': {
      // 安可是主唱的: the arena becomes a live house — the house lights go down, two stage beams in the band
      // colours sweep across from the top corners, a haze under the roof. Screen space, behind everyone.
      const layers = getEncoreLayers();
      if (!layers) break;
      const t = e.max - e.life;
      const fade = Math.min(1, t / .2) * Math.min(1, e.life / .4);
      ctx.globalAlpha = fade;
      ctx.drawImage(layers.house, 0, 0);
      const grads = beamGrads(ctx);
      for (let b = 0; b < 2; b++) {
        const s0 = b ? -1 : 1;
        const ang = Math.PI / 2 - s0 * (.55 + Math.sin(t * 1.8 + b * 1.6) * .32);
        ctx.save();
        ctx.translate(b ? W : 0, -10);
        ctx.rotate(ang - Math.PI / 2);
        ctx.fillStyle = grads[b];
        ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(120, H * 1.2); ctx.lineTo(-120, H * 1.2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'encore-crowd': {
      // 安可是主唱的: the floor along the bottom of the frame — two rows of heads and shoulders, light sticks
      // up and pumping together on the beat, mostly in the new vocalist's green, notes drifting up.
      // Screen space, in front of everyone. Batched: one fill per row of bodies and one stroke per
      // stick colour per layer, so the whole crowd is about a dozen draw calls.
      const t = e.max - e.life;
      const fade = Math.min(1, t / .25) * Math.min(1, e.life / .4);
      const lite = isLiteFx();
      const beat = Math.sin(t * Math.PI * 2 * 2.2);
      const colours = [e.color, '#77FFFF', '#EE99EE'];
      let n = 0;
      for (let row = 1; row >= 0; row--) {
        const count = row ? 18 : 14;
        const scale = row ? .78 : 1;
        const base = row ? H - 34 : H - 8;
        const bob = Math.max(0, beat) * 4 * scale;
        for (let i = 0; i < count; i++, n++) {
          const x = (i + .5) * (W / count) + Math.sin(i * 3.1 + row) * 12;
          const ang = (beat * .5 + Math.sin(i * 1.7) * .15) * (i % 2 ? 1 : -1) * .6;
          const hx = x + 16 * scale, hy = base - 34 * scale - bob;
          CROWD[n * 5] = hx; CROWD[n * 5 + 1] = hy;
          CROWD[n * 5 + 2] = Math.sin(ang) * scale; CROWD[n * 5 + 3] = -Math.cos(ang) * scale;
          const k = i + row * 3;
          CROWD[n * 5 + 4] = k % 7 === 3 ? 2 : k % 5 === 2 ? 1 : 0;
        }
        // Sticks behind this row's heads: glow, core, then the white highlight, one path per colour.
        const first = n - count;
        ctx.lineCap = 'round';
        const layers: [number, number, number, number][] = lite ? [[4.5, 1, 0, 32]] : [[12, .3, 0, 32], [4.5, 1, 0, 32]];
        for (const [w, a, from, to] of layers) {
          ctx.globalAlpha = fade * a;
          ctx.lineWidth = w * scale;
          for (let c = 0; c < 3; c++) {
            ctx.strokeStyle = colours[c];
            ctx.beginPath();
            for (let j = first; j < n; j++) {
              if (CROWD[j * 5 + 4] !== c) continue;
              const hx = CROWD[j * 5], hy = CROWD[j * 5 + 1], ux = CROWD[j * 5 + 2], uy = CROWD[j * 5 + 3];
              ctx.moveTo(hx + ux * from, hy + uy * from); ctx.lineTo(hx + ux * to, hy + uy * to);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        for (let j = first; j < n; j++) {
          const hx = CROWD[j * 5], hy = CROWD[j * 5 + 1], ux = CROWD[j * 5 + 2], uy = CROWD[j * 5 + 3];
          ctx.moveTo(hx + ux * 4, hy + uy * 4); ctx.lineTo(hx + ux * 30, hy + uy * 30);
        }
        ctx.stroke();
        ctx.globalAlpha = fade * (row ? .8 : .95);
        ctx.fillStyle = row ? '#120f1e' : '#06050b';
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = (i + .5) * (W / count) + Math.sin(i * 3.1 + row) * 12;
          const hy = base - 30 * scale - bob, sy = base + 6 * scale - bob;
          ctx.moveTo(x + 15 * scale, hy); ctx.arc(x, hy, 15 * scale, 0, Math.PI * 2);
          ctx.moveTo(x + 30 * scale, sy); ctx.ellipse(x, sy, 30 * scale, 24 * scale, 0, 0, Math.PI, true);
          ctx.rect(x - 30 * scale, sy, 60 * scale, 40);
        }
        ctx.fill();
      }
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const k = ((t * .45 + i * .14) % 1);
        const x = W * ((i * .137 + .08) % 1) + Math.sin(t * 2 + i) * 10;
        ctx.globalAlpha = fade * (1 - k) * .8;
        note(ctx, x, H - 70 - k * 170, i % 2 ? '#ffffff' : '#c8ffc8');
      }
      const layers = getEncoreLayers();
      if (layers) { ctx.globalAlpha = fade * .5; ctx.drawImage(layers.glow, 0, H - 140); }
      break;
    }
    case 'encore-call': {
      // 安可是主唱的: a call from the floor, in neon — 安可！ blooms over the crowd and floats up. Screen space.
      const t = e.max - e.life;
      const k = backOut(Math.min(1, t / .14));
      const size = (e.radius ?? 26) * k;
      ctx.translate(e.x, e.y - t * 30);
      ctx.rotate((e.dir ?? 0) * .08);
      ctx.font = `900 ${size}px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const a = Math.min(1, e.life / .3);
      if (!isLiteFx()) {
        ctx.globalAlpha = a * .25; ctx.strokeStyle = e.color; ctx.lineWidth = 14; ctx.strokeText('安可！', 0, 0);
      }
      ctx.globalAlpha = a * .6; ctx.strokeStyle = e.color; ctx.lineWidth = 6; ctx.strokeText('安可！', 0, 0);
      ctx.globalAlpha = a; ctx.fillStyle = '#f4fff4'; ctx.fillText('安可！', 0, 0);
      break;
    }
    case 'encore-spot': {
      // 安可是主唱的: the one warm beam that picks out the body they are calling for, dust turning in it, and a
      // microphone stand standing in front of them — they are the vocalist now.
      const t = e.max - e.life;
      const land = Math.min(1, t / .08);
      const fade = Math.min(1, e.life / .3);
      const dir = e.dir ?? 1;
      const bottom = r, top = bottom * .22;
      ctx.translate(e.x, e.y);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(-bottom, 0, bottom, 0);
      beam.addColorStop(0, 'rgba(255,246,216,0)');
      beam.addColorStop(.5, `rgba(255,250,232,${.62 * land * fade})`);
      beam.addColorStop(1, 'rgba(255,246,216,0)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(-top, -e.y); ctx.lineTo(top, -e.y); ctx.lineTo(bottom, 0); ctx.lineTo(-bottom, 0); ctx.closePath(); ctx.fill();
      const pool = ctx.createRadialGradient(0, 0, 4, 0, 0, bottom * 1.3);
      pool.addColorStop(0, `rgba(255,252,240,${.85 * fade})`);
      pool.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(0, 0, bottom * 1.3, bottom * .32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 10; i++) {
        const u = (i * .17 + t * (.35 + (i % 3) * .12)) % 1;
        const half = top + (bottom - top) * u;
        ctx.globalAlpha = fade * land * (.3 + .4 * Math.sin(t * 8 + i * 2)) * (1 - Math.abs(u - .5));
        ctx.beginPath(); ctx.arc(Math.sin(i * 2.7 + t * 1.1) * half * .6, -e.y * (1 - u), 1.4 + (i % 2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (t < .2) {
        ctx.globalAlpha = 1 - t / .2;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, bottom * (1 + t * 4), bottom * .3 * (1 + t * 4), 0, 0, Math.PI * 2); ctx.stroke();
      }
      const up = backOut(Math.min(1, Math.max(0, t - .05) / .12));
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(dir * 46, 0);
      ctx.scale(1, up);
      ctx.strokeStyle = '#151222'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, -6); ctx.lineTo(14, 0); ctx.moveTo(0, -6); ctx.lineTo(0, -112); ctx.lineTo(-dir * 16, -126); ctx.stroke();
      ctx.strokeStyle = '#c9cfe0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -110); ctx.stroke();
      ctx.fillStyle = '#2b2d3a';
      ctx.beginPath(); ctx.ellipse(-dir * 20, -130, 6, 9, -dir * .6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (t > .1) {
        ctx.globalAlpha = fade * (.6 + .4 * Math.sin(t * 10));
        sparkle(ctx, 0, -196, 8, '#fff3b0');
        sparkle(ctx, -18, -184, 4, '#ffffff');
        sparkle(ctx, 18, -186, 5, '#ffffff');
      }
      break;
    }
    case 'encore-rain': {
      // 安可是主唱的: when her face goes dark the rain comes — cold slanting streaks over the whole stage and a
      // faint blue wash. Screen space, in front of everyone.
      const t = e.max - e.life;
      const fade = Math.min(1, t / .25) * Math.min(1, e.life / .5);
      ctx.globalAlpha = fade * .16;
      ctx.fillStyle = '#1c3a6a';
      ctx.fillRect(0, 0, W, H);
      const count = isLiteFx() ? 40 : 80;
      ctx.strokeStyle = '#b8d6ff'; ctx.lineCap = 'round';
      // Six classes (three alphas × two widths), one stroked path each.
      for (let cls = 0; cls < 6; cls++) {
        ctx.globalAlpha = fade * (.25 + (cls % 3) * .15);
        ctx.lineWidth = 1 + (cls % 2);
        ctx.beginPath();
        for (let i = cls; i < count; i += 6) {
          const sx = (i * 97.3) % W, speed = 900 + (i % 5) * 120;
          const y = ((i * 53.1 + t * speed) % (H + 80)) - 40;
          const x = sx - (y + 40) * .25;
          ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 22 + (i % 4) * 4);
        }
        ctx.stroke();
      }
      break;
    }
    case 'encore-eye': {
      // 安可是主唱的: the dark face keeps two points of light where the eyes are. Drawn by the renderer.
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = .95;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(dir * 3), -1, 4, 2);
      ctx.fillRect(Math.round(dir * 13), -1, 4, 2);
      ctx.globalAlpha = .4; ctx.fillStyle = '#bff8ff';
      ctx.fillRect(Math.round(dir * 3 - dir * 10), -1, 10 * dir, 1);
      break;
    }
    case 'lyric-page': {
      // 安可是主唱的: blank lyric-book pages torn loose behind the run, fluttering back and down.
      const dir = e.dir ?? 1;
      const seed = e.n ?? 0;
      const t = e.max - e.life;
      const x = -dir * (60 + seed % 3 * 30) * p + Math.sin(t * 7 + seed) * 12;
      const y = -30 * Math.sin(Math.min(1, p * 2) * Math.PI / 2) + 120 * p * p;
      ctx.translate(e.x + x, e.y + y);
      ctx.rotate(Math.sin(t * 6 + seed * 1.3) * .8 + seed);
      ctx.scale(Math.cos(t * 9 + seed), 1);
      ctx.globalAlpha = Math.min(1, e.life / .3) * .95;
      ctx.scale(1.5, 1.5);
      ctx.fillStyle = '#f4efe6'; ctx.strokeStyle = '#151222'; ctx.lineWidth = 1.2;
      ctx.fillRect(-8, -10, 16, 20); ctx.strokeRect(-8, -10, 16, 20);
      ctx.strokeStyle = '#9ab6d8'; ctx.lineWidth = .8;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-5, -6 + k * 4); ctx.lineTo(5, -6 + k * 4); ctx.stroke(); }
      break;
    }
    case 'encore-cut': {
      // Where she goes through them: a fat black crescent blade with a cyan edge, a white flash line
      // through it and a burst star at the middle.
      const dir = e.dir ?? 1;
      const q = easeOut(Math.min(1, p * 1.6));
      const L = r * 1.8 * q;
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.rotate(-.3 + (e.n ?? 0) * .3);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#0a0b14';
      ctx.beginPath(); ctx.moveTo(-L, 8); ctx.quadraticCurveTo(0, -46, L, -2); ctx.quadraticCurveTo(0, -12, -L, 8); ctx.fill();
      ctx.strokeStyle = '#77FFFF'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-L, 8); ctx.quadraticCurveTo(0, -46, L, -2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-L * .9, 2); ctx.lineTo(L * .9, -8); ctx.stroke();
      if (p < .4) {
        ctx.globalAlpha = 1 - p / .4;
        jag(ctx, 22 * (1 - p), 9, 6);
        ctx.fillStyle = '#ffffff'; ctx.fill();
      }
      break;
    }
    case 'encore-shatter': {
      // The last blow: the spotlight on them breaks like glass — a white cross flash and pale gold shards
      // raining down out of the beam.
      const t = e.max - e.life;
      ctx.translate(e.x, e.y);
      if (t < .14) {
        ctx.globalAlpha = 1 - t / .14;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6;
        const s = 60 + t * 300;
        ctx.beginPath(); ctx.moveTo(-s, -s * .5 - 90); ctx.lineTo(s, s * .5 - 90); ctx.moveTo(s, -s * .5 - 90); ctx.lineTo(-s, s * .5 - 90); ctx.stroke();
      }
      for (let i = 0; i < 16; i++) {
        const x0 = (i - 8) * 9 + Math.sin(i * 4.1) * 10;
        const y0 = -220 + (i % 5) * 30;
        const vy = 120 + (i % 4) * 60;
        const x = x0 + Math.sin(i * 2.3) * 60 * p, y = y0 + vy * t + 500 * t * t;
        ctx.globalAlpha = (1 - p) * .9;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (6 + i));
        ctx.fillStyle = i % 3 ? '#fff6d8' : '#ffffff';
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 4); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'encore-exit': {
      // Out of the frame (or back in): a slit of light at the edge, dust and speed lines.
      const dir = e.dir ?? 1;
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = (1 - p) * .8;
      ctx.fillStyle = e.color;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath(); ctx.arc(-dir * (i * 14 + p * 40), -8 - (i % 3) * 12 - p * 20, 9 + p * 12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const y = -20 - i * 26;
        ctx.beginPath(); ctx.moveTo(-dir * (10 + p * 50), y); ctx.lineTo(-dir * (110 + p * 80 + (i % 2) * 40), y); ctx.stroke();
      }
      ctx.globalAlpha = (1 - p);
      const slit = ctx.createLinearGradient(0, -200, 0, 0);
      slit.addColorStop(0, 'rgba(255,255,255,0)'); slit.addColorStop(.5, 'rgba(220,255,255,.9)'); slit.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = slit;
      ctx.fillRect(-3 * (1 - p) - 1, -200, 6 * (1 - p) + 2, 200);
      break;
    }
    case 'nagi-tear': {
      // ……来练习吧, the opening: the light in her eye gathers into one tear and lets go. It falls to the
      // floor and is gone — the sea (nagi-sea) opens from that spot. r is the fall from eye to floor.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      const gather = TEAR_GATHER;
      // It reaches the floor exactly as the sea opens, whatever the fall: an even acceleration over the drop.
      const fallTime = Math.max(.05, (e.t0 ?? .45) - SEA_LEAD - gather);
      ctx.translate(e.x + dir * 2, e.y);
      ctx.fillStyle = '#ffffff';
      if (t < gather) {
        // The glint shrinks into a bead at the corner of the eye.
        const k = t / gather;
        ctx.globalAlpha = .95;
        const g0 = 9 * (1 - k) + 2;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-g0, 0); ctx.lineTo(g0, 0); ctx.moveTo(0, -g0); ctx.lineTo(0, g0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 2.4 + k * 2, 0, Math.PI * 2); ctx.fill();
        break;
      }
      const ft = t - gather;
      const y = Math.min(r, r * (ft / fallTime) * (ft / fallTime));
      if (y >= r) break;
      const stretch = 1 + Math.min(.9, ft * 3.2);
      // A faint streak where it has just fallen through.
      ctx.globalAlpha = .45;
      ctx.strokeStyle = '#eef7ff'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, Math.max(0, y - 14 * stretch)); ctx.lineTo(0, y - 6); ctx.stroke();
      ctx.translate(0, y);
      // A teardrop: round below, pointed above, stretched a little as it speeds up.
      ctx.globalAlpha = .95;
      ctx.fillStyle = e.color;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -8 * stretch);
      ctx.quadraticCurveTo(4.6, -2, 4.4, 1.5);
      ctx.arc(0, 1.5, 4.4, 0, Math.PI);
      ctx.quadraticCurveTo(-4.6, -2, 0, -8 * stretch);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-1.4, .4, 1.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'nagi-sea': {
      // ……来练习吧: the water. It opens where the tear lands and spreads both ways as a thin sheet over
      // the floor. Each strum (t0 + practiceBeat) makes it rougher — taller swell, faster chop, foam on
      // the crests. After the seventh the swell dies away within a beat and the sheet goes flat as a
      // mirror: one slow ring under her, a band of light, a few points of light, and then it is gone. 凪.
      const t = e.max - e.life;
      const t0 = e.t0 ?? .45;
      const dir = e.dir ?? 1;
      const open = t0 - SEA_LEAD;
      if (t < open) break;
      const w = Math.min(r, SEA_MAX_HALF, (t - open) * 1700);
      if (w < SEA_STEP) break;
      const landed = practiceStrums(t - t0);
      const tf = t0 + practiceBeat(PRACTICE_HITS - 1);
      const peak = 2 + (PRACTICE_HITS - 1) * 2.4;
      const swell = t < tf ? 1.5 + landed * 2.4 : peak * Math.exp(-(t - tf) / .2);
      const calm = t > tf ? Math.min(1, (t - tf) / .7) : 0;
      const out = Math.min(1, e.life / .7);
      const speed = 4 + landed * 1.2;
      // Sample the surface once; the fill, the line and the foam all read the same samples.
      // Lite halves the samples: the sheet is low and soft, the coarser line does not show.
      const step = liteFx ? SEA_STEP * 2 : SEA_STEP;
      const count = Math.floor((2 * w) / step) + 1;
      for (let k = 0; k < count; k++) {
        const x = -w + k * step;
        const edge = Math.max(0, 1 - (x / w) * (x / w));
        const kx = x * dir * .032;
        seaY[k] = -2.5 - calm * 3.5 * edge - swell * edge * (.62 * Math.sin(kx - t * speed) + .38 * Math.sin(kx * 2.3 - t * speed * 1.7 + 1.3));
      }
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = out;
      // The sheet of water, fading out toward its edges.
      const body = ctx.createLinearGradient(-w, 0, w, 0);
      body.addColorStop(0, 'rgba(120,150,255,0)');
      body.addColorStop(.5, `rgba(120,150,255,${.24 + .12 * calm})`);
      body.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(-w, 4);
      for (let k = 0; k < count; k++) ctx.lineTo(-w + k * step, seaY[k]);
      ctx.lineTo(w, 4); ctx.closePath(); ctx.fill();
      // The surface line, fading toward the ends in three solid steps: a gradient stroke this long
      // costs about twice as much to raster, and at 1.5px the steps do not show.
      ctx.strokeStyle = '#e1f0ff'; ctx.lineWidth = 1.5;
      // Each segment belongs to the band its midpoint falls in, so neighbouring bands share an endpoint.
      for (let band = 0; band < SEA_LINE_BANDS.length; band++) {
        const [inner, outer, alpha] = SEA_LINE_BANDS[band];
        ctx.globalAlpha = out * alpha;
        ctx.beginPath();
        let open = false;
        for (let k = 0; k + 1 < count; k++) {
          const x = -w + k * step;
          const u = Math.abs(x + step / 2) / w;
          if (u < inner || u >= outer && !(band === SEA_LINE_BANDS.length - 1 && u <= 1.01)) { open = false; continue; }
          if (!open) { ctx.moveTo(x, seaY[k]); open = true; }
          ctx.lineTo(x + step, seaY[k + 1]);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = out;
      // Foam on the crests while it is rough: one path, one fill (the swell already flattens toward
      // the edges, so the dots thin out there on their own). Lite skips it.
      if (swell > 7 && !liteFx) {
        ctx.globalAlpha = out * Math.min(1, (swell - 7) / 8) * .7;
        ctx.fillStyle = '#f4f9ff';
        ctx.beginPath();
        for (let k = 2; k < count - 2; k += 2) {
          const x = -w + k * step, y = seaY[k];
          if (y > -2.5 - swell * .6) continue;
          const cx = x + Math.sin(x * 1.7 + t * 9) * 2, cy = y - 1.5;
          ctx.moveTo(cx + 1.6, cy); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      if (calm > 0) {
        // Still water: one slow ring opening under her, and a few points of light on the mirror.
        const k = Math.min(1, (t - tf - .25) / 1.1);
        if (k > 0) {
          ctx.globalAlpha = out * (1 - k) * .7;
          ctx.strokeStyle = '#e6f1ff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(dir * 56, -1, 30 + k * 170, (30 + k * 170) * .12, 0, 0, Math.PI * 2); ctx.stroke();
        }
        // A soft band of reflected light sliding slowly across the mirror.
        const sx = dir * (-w * .6 + (t - tf) * 160);
        const band = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(.5, `rgba(255,255,255,${.6 * calm})`);
        band.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = out;
        ctx.strokeStyle = band; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(sx - 90, -5.5); ctx.lineTo(sx + 90, -5.5); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 5; i++) {
          const x = (i - 2) * w * .3 + dir * 30;
          const tw = Math.max(0, Math.sin(t * 5 + i * 1.9));
          ctx.globalAlpha = out * calm * tw * .9;
          const sz = 1 + tw * 2.2;
          ctx.fillRect(x - sz * 2, -6, sz * 4, 1);
          ctx.fillRect(x - .5, -6 - sz, 1, sz * 2);
        }
      }
      break;
    }
    case 'nagi-wave': {
      // ……来练习吧, one strum: a wave stands up out of the water in front of her and rolls at them —
      // a gentle back, a steep front, a white lip — and sinks as it goes. Each strum's wave is taller.
      // A short white flick at the strumming hand marks the beat.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      const i = e.n ?? 0;
      ctx.translate(e.x, e.y);
      if (t < .1) {
        ctx.globalAlpha = (1 - t / .1) * .9;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        const d = Math.min(1, t / .05);
        ctx.beginPath(); ctx.moveTo(-dir * 26, -98); ctx.lineTo(-dir * (26 - 8 * d), -98 + 40 * d); ctx.stroke();
      }
      const H = 22 + i * 8;
      const rise = Math.sin(Math.min(1, p * 1.15) * Math.PI);
      const h = H * Math.pow(Math.max(0, rise), .75);
      const xc = dir * (1 - (1 - p) * (1 - p)) * 190;
      const back = 56 + i * 4, front = 20 + i * 2;
      const prof = (u: number) => u < 0 ? Math.exp(-(u / back) * (u / back) * 2.2) : Math.exp(-(u / front) * (u / front) * 2.2);
      const fade = Math.min(1, (1 - p) * 2.2);
      ctx.beginPath();
      ctx.moveTo(xc - dir * back * 1.4, 2);
      for (let k = -14; k <= 10; k++) {
        const u = k < 0 ? (k / 14) * back * 1.4 : (k / 10) * front * 1.6;
        ctx.lineTo(xc + dir * u, -h * prof(u));
      }
      ctx.lineTo(xc + dir * front * 1.6, 2);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -h, 0, 2);
      g.addColorStop(0, `rgba(170,195,255,${.55 * fade})`);
      g.addColorStop(1, `rgba(85,85,255,${.12 * fade})`);
      ctx.fillStyle = g;
      ctx.fill();
      // The white lip along the top of the face.
      ctx.globalAlpha = fade * .9;
      ctx.strokeStyle = '#f4f9ff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = -6; k <= 4; k++) {
        const u = k < 0 ? (k / 14) * back * 1.4 : (k / 10) * front * 1.6;
        const x = xc + dir * u, y = -h * prof(u);
        if (k === -6) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // A little spray off the crest once it has height.
      if (h > 14) {
        ctx.fillStyle = '#f4f9ff';
        for (let k = 0; k < 3 + (i >> 1); k++) {
          const st = (t * 3 + k * .27) % 1;
          ctx.globalAlpha = fade * (1 - st) * .85;
          ctx.beginPath(); ctx.arc(xc + dir * (4 + st * (16 + k * 6)), -h - st * 14 + st * st * 22, 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'nagi-crash': {
      // ……来练习吧, the seventh: the big one. A wave rears up just behind them, its lip curls forward and
      // hooks down over where they stand, and it breaks — spray thrown up, a ring of foam racing out
      // along the floor. Then it is only water; nagi-sea carries it into the calm.
      const t = e.max - e.life;
      const dir = e.dir ?? 1;
      const H = r;
      const RISE = .1, CURL = .2, FALL = .3;
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (t < FALL) {
        const up = Math.min(1, t / RISE);
        const curl = Math.max(0, Math.min(1, (t - RISE) / (CURL - RISE)));
        const fall = Math.max(0, Math.min(1, (t - CURL) / (FALL - CURL)));
        const h = H * (.3 + .7 * (1 - (1 - up) * (1 - up))) * (1 - fall * .7);
        const lipX = -8 + curl * 52, lipY = -h * (.92 - curl * .5);
        const crest = (from: boolean) => {
          if (from) { ctx.moveTo(-112, 4); ctx.bezierCurveTo(-80, -h * .12, -64, -h, -32, -h); }
          ctx.bezierCurveTo(4, -h * 1.06, lipX + 10, -h * .98, lipX, lipY);
        };
        const g = ctx.createLinearGradient(0, -h, 0, 4);
        g.addColorStop(0, `rgba(190,208,255,${.66 * (1 - fall * .5)})`);
        g.addColorStop(1, `rgba(85,85,255,${.18 * (1 - fall * .5)})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        crest(true);
        ctx.quadraticCurveTo(lipX - 12, -h * .5, -14, -h * .5);
        ctx.quadraticCurveTo(-26, -h * .22, -10, 4);
        ctx.closePath(); ctx.fill();
        // The tube under the lip, a shade deeper.
        ctx.fillStyle = `rgba(60,60,190,${.18 * curl * (1 - fall)})`;
        ctx.beginPath(); ctx.moveTo(lipX, lipY); ctx.quadraticCurveTo(lipX - 12, -h * .5, -14, -h * .5); ctx.quadraticCurveTo(-4, -h * .8, lipX, lipY); ctx.fill();
        // The white edge along the back, over the crest and round the lip.
        ctx.globalAlpha = 1 - fall * .5;
        ctx.strokeStyle = '#f6faff'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-62, -h * .8); ctx.bezierCurveTo(-54, -h * .97, -44, -h, -32, -h); crest(false); ctx.stroke();
        // Spray peeling off the lip.
        ctx.fillStyle = '#f6faff';
        for (let k = 0; k < 7; k++) {
          const s0 = ((t * 5) + k * .14) % 1;
          ctx.globalAlpha = (1 - s0) * .85 * (1 - fall);
          ctx.beginPath(); ctx.arc(lipX + s0 * (14 + k * 5), lipY - 6 - s0 * 14 + s0 * s0 * 30, 1.6 + (k % 2) * .6, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (t > CURL) {
        // The break: spray thrown up and out, a few short splash streaks, the foam ring along the floor.
        const bt = t - CURL;
        const k = Math.min(1, bt / (e.max - CURL));
        const q = 1 - (1 - k) * (1 - k);
        ctx.globalAlpha = (1 - k) * .85;
        ctx.strokeStyle = '#f6faff'; ctx.lineWidth = 2.6 * (1 - k) + .6;
        ctx.beginPath(); ctx.ellipse(10, -1, 26 + q * 150, (26 + q * 150) * .14, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#eaf3ff'; ctx.lineWidth = 1.6;
        for (let i = 0; i < 5; i++) {
          const x = (i - 2) * 18 + 10;
          const top = -(36 + (i % 2) * 22) * Math.sin(Math.min(1, k * 2.2) * Math.PI);
          ctx.globalAlpha = (1 - k) * .7;
          ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x + (i - 2) * 4, top); ctx.stroke();
        }
        ctx.fillStyle = '#eaf3ff';
        ctx.globalAlpha = (1 - k) * .9;
        ctx.beginPath();
        for (let i = 0; i < (liteFx ? 6 : 12); i++) {
          const ang = -Math.PI / 2 + (i - 5.5) * .2;
          const v = 300 + (i % 4) * 60;
          const x = 10 + Math.cos(ang) * v * bt * 1.2, y = -24 + Math.sin(ang) * v * bt + 1100 * bt * bt;
          if (y > 0) continue;
          const dr = 2 + (i % 3) * .7;
          ctx.moveTo(x + dr, y); ctx.arc(x, y, dr, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      break;
    }
    // 必杀聚焦 is a camera move the renderer reads; it draws nothing of its own.
    case 'super-zoom':
      break;
    case 'super':
    default:
      ctx.translate(e.x, e.y); ctx.rotate(p * 1.5);
      ctx.lineWidth = 3;
      ctx.strokeRect(-r * p, -r * p, r * p * 2, r * p * 2);
      ctx.rotate(Math.PI / 4);
      ctx.strokeRect(-r * p * .7, -r * p * .7, r * p * 1.4, r * p * 1.4);
      break;
  }
  ctx.restore();
}

/** Straight pale ribbon behind a note, so the lane stays readable. */
function noteRibbon(ctx: CanvasRenderingContext2D, p: Projectile, outer = '#e7a0b8', inner = '#ff4f96'): void {
  const pts = p.trail;
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (width: number, color: string, alpha: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  stroke(7, outer, .35);
  stroke(3, inner, .7);
}

/* ---- 音符彗星: the default look for a music-note shot ----
   A note sealed in a lit sphere, dragging a tapered band along the real flight path.
   Everything derives from one colour: the projectile's colour (the character's rep colour). */

type Rgb = [number, number, number];
function rgbOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return [255, 255, 255];
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function mixRgb(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
function cssRgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

/** A quaver: dark outline, the body in `color`, a pale shine on the head. `ink` is the outline. */
function noteGlyph(ctx: CanvasRenderingContext2D, s: number, color: string, ink = '#16141f', shine = '#f7f1e4'): void {
  ctx.fillStyle = ink;
  ctx.fillRect(s * .32, -s * 1.4, s * .34, s * 1.55);
  ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .78, s * .52, -.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
  ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shine;
  ctx.beginPath(); ctx.ellipse(-s * .2, s * .08, s * .2, s * .12, -.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * .56, -s * 1.28);
  ctx.quadraticCurveTo(s * 1.35, -s * .72, s * .62, -s * .32);
  ctx.quadraticCurveTo(s * 1.05, -s * .78, s * .56, -s * .96);
  ctx.fill();
}

const BLOOD_HEAD: Rgb = [229, 36, 59];
const BLOOD_TAIL: Rgb = [96, 24, 104];
/** The ribbon is drawn in this many brightness steps; each step is one stroke. */
const RIBBON_STEPS = 6;
/** Per pass (soft wide, thin bright) and step: the colour string and the width. Built once. */
const RIBBON_INK = [0, 1].map(pass => Array.from({ length: RIBBON_STEPS }, (_, i) => {
  const k = (i + 1) / RIBBON_STEPS;
  return { color: cssRgba(mixRgb(BLOOD_TAIL, BLOOD_HEAD, k), (pass === 0 ? .16 : .78) * k), width: (pass === 0 ? 10 : 3.2) * (.25 + .75 * k) };
}));
/** 血月的奏鸣: a long thin ribbon along the note's own path, red at the note and fading to dark violet
 *  at the tail. One soft wide pass under one thin bright pass; lite drops the soft pass. The samples
 *  brighten monotonically toward the head, so each brightness step is one contiguous run and one
 *  stroke: 12 strokes a note instead of one per segment, and no colour strings built per frame. */
function bloodRibbon(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const pts = p.trail;
  const n = pts.length;
  if (n < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = Math.min(1, p.life / .2, p.age / .06);
  for (let pass = liteFx ? 1 : 0; pass < 2; pass++) {
    const ink = RIBBON_INK[pass];
    let step = -1;
    for (let i = 0; i <= n; i++) {
      const at = i < n ? pts[i] : p;
      const next = Math.min(RIBBON_STEPS - 1, Math.floor(i / (n + 1) * RIBBON_STEPS));
      if (next !== step) {
        if (step >= 0) { ctx.lineTo(at.x, at.y); ctx.stroke(); }
        step = next;
        ctx.strokeStyle = ink[step].color;
        ctx.lineWidth = ink[step].width;
        ctx.beginPath();
        ctx.moveTo(at.x, at.y);
      } else ctx.lineTo(at.x, at.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 血月的奏鸣: the bloom under each note. Every note shares one size, so one gradient per context. */
const NOTE_BLOOM = new WeakMap<CanvasRenderingContext2D, CanvasGradient>();
function noteBloom(ctx: CanvasRenderingContext2D, R: number): CanvasGradient {
  let g = NOTE_BLOOM.get(ctx);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 1, 0, 0, R);
    g.addColorStop(0, 'rgba(255,120,130,.42)');
    g.addColorStop(1, 'rgba(229,36,59,0)');
    NOTE_BLOOM.set(ctx, g);
  }
  return g;
}

/** Scratch for the trail. 112 is the largest cap in SCRIPTS (music-note), and one comet draws at a time. */
const COMET_MAX = 128;
const cometLens = new Float64Array(COMET_MAX);
const cometNx = new Float64Array(COMET_MAX);
const cometNy = new Float64Array(COMET_MAX);

/** Point `need` px along the trail from its oldest end, with the local tangent and normal. */
function sampleTrail(n: number, xAt: (i: number) => number, yAt: (i: number) => number, need: number): { x: number; y: number; nx: number; ny: number; tx: number; ty: number } {
  let i = 1;
  while (i < n - 1 && cometLens[i] < need) i++;
  const ax = xAt(i - 1), ay = yAt(i - 1), bx = xAt(i), by = yAt(i);
  const span = cometLens[i] - cometLens[i - 1] || 1;
  const k = Math.max(0, Math.min(1, (need - cometLens[i - 1]) / span));
  const dx = bx - ax, dy = by - ay;
  const m = Math.hypot(dx, dy) || 1;
  return { x: ax + dx * k, y: ay + dy * k, tx: dx / m, ty: dy / m, nx: -dy / m, ny: dx / m };
}

/** The trail half: a wide glow and a narrow core, both tapering and fading toward the tail.
 *  ponytail: the per-frame path copy and its point arrays are gone; the geometry lives in the
 *  shared scratch above, so the super's ten notes do not hand GC a thousand objects a frame. */
function noteComet(ctx: CanvasRenderingContext2D, p: Projectile): void {
  const trail = p.trail;
  const m = trail.length;
  if (m < 2) return;
  const n = Math.min(m + 1, COMET_MAX);
  const base = m + 1 - n;
  const xAt = (i: number) => base + i < m ? trail[base + i].x : p.x;
  const yAt = (i: number) => base + i < m ? trail[base + i].y : p.y;
  const color = rgbOf(p.color);
  const mid = mixRgb(color, [255, 255, 255], .4);
  const R = Math.max(9, Math.min(22, p.size * .42));
  cometLens[0] = 0;
  for (let i = 1; i < n; i++) cometLens[i] = cometLens[i - 1] + Math.hypot(xAt(i) - xAt(i - 1), yAt(i) - yAt(i - 1));
  const total = cometLens[n - 1];
  if (total < 1) return;
  // A short ease-in at birth and a fade over the last 0.16s of the shot's life.
  const fade = Math.min(1, p.age / .05, p.life / .16);

  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
    const dx = xAt(b) - xAt(a), dy = yAt(b) - yAt(a), h = Math.hypot(dx, dy) || 1;
    cometNx[i] = -dy / h;
    cometNy[i] = dx / h;
  }
  const stride = liteFx ? 3 : 1;
  const strip = (halfAt: (u: number) => number) => {
    ctx.beginPath();
    for (let i = 0; i < n; i += stride) {
      const h = halfAt(i / (n - 1));
      const x = xAt(i) + cometNx[i] * h, y = yAt(i) + cometNy[i] * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if ((n - 1) % stride) {
      const h = halfAt(1);
      ctx.lineTo(xAt(n - 1) + cometNx[n - 1] * h, yAt(n - 1) + cometNy[n - 1] * h);
    }
    for (let i = n - 1; i >= 0; i -= stride) {
      const h = -halfAt(i / (n - 1));
      ctx.lineTo(xAt(i) + cometNx[i] * h, yAt(i) + cometNy[i] * h);
    }
    if ((n - 1) % stride) {
      const h = -halfAt(0);
      ctx.lineTo(xAt(0) + cometNx[0] * h, yAt(0) + cometNy[0] * h);
    }
    ctx.closePath();
  };

  const hx = xAt(n - 1), hy = yAt(n - 1), tx = xAt(0), ty = yAt(0);
  ctx.globalAlpha = fade;
  // Wide glow: bright at the orb, gone by the tail.
  const glow = ctx.createLinearGradient(hx, hy, tx, ty);
  glow.addColorStop(0, cssRgba(color, .5));
  glow.addColorStop(.28, cssRgba(color, .28));
  glow.addColorStop(.72, cssRgba(color, .07));
  glow.addColorStop(1, cssRgba(color, 0));
  ctx.fillStyle = glow;
  strip(u => 1 + R * 1.15 * Math.pow(u, .85));
  ctx.fill();
  // Narrow core.
  const core = ctx.createLinearGradient(hx, hy, tx, ty);
  core.addColorStop(0, cssRgba(mid, .9));
  core.addColorStop(.3, cssRgba(mid, .5));
  core.addColorStop(1, cssRgba(mid, 0));
  ctx.fillStyle = core;
  strip(u => .6 + R * .42 * Math.pow(u, .9));
  ctx.fill();

  // Energy streaming backward: bright beads slide from the orb toward the tail.
  const flow = p.age * 2.4;
  const beads = liteFx ? 2 : 3;
  for (let k = 0; k < beads; k++) {
    const f = (flow + k / beads) % 1;
    const q = sampleTrail(n, xAt, yAt, Math.max(0, total * (1 - f)));
    const r = (2 + R * .2) * (1 - f * .35);
    ctx.globalAlpha = fade * (1 - f) * .9;
    ctx.fillStyle = cssRgba(mixRgb(color, [255, 255, 255], .9), 1);
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    // A short streak pulled toward the tail.
    ctx.strokeStyle = cssRgba(color, .7);
    ctx.lineWidth = r * .85;
    ctx.beginPath();
    ctx.moveTo(q.x - q.tx * r * .5, q.y - q.ty * r * .5);
    ctx.lineTo(q.x - q.tx * r * 2.4, q.y - q.ty * r * 2.4);
    ctx.stroke();
  }

  // Sparse sparks shed along the way.
  const sparks = liteFx ? 2 : 4;
  for (let k = 0; k < sparks; k++) {
    const f = (flow * .7 + k * .23 + .11) % 1;
    const q = sampleTrail(n, xAt, yAt, Math.max(0, total * (1 - f)));
    const side = Math.sin(k * 7.13 + p.age * 4.1) * R * .8;
    ctx.globalAlpha = fade * (1 - f) * .7;
    ctx.fillStyle = cssRgba(color, 1);
    ctx.beginPath(); ctx.arc(q.x + q.nx * side, q.y + q.ny * side, 1.2 + (k % 2) * .7, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, images?: ImageCache): void {
  // 抹茶芭菲: the standing parfait is drawn by its effect, never as a shot.
  if (p.fx === 'parfait') return;
  ctx.save();
  // 火的故事: the arrow art rides ten pixels above its flight band so the flame head reads on the body.
  if (p.fx === 'fuga') ctx.translate(0, -10);
  if (p.fx === 'mutsumi-note' || p.fx === 'chord') noteRibbon(ctx, p);
  else if (p.fx === 'sob') noteRibbon(ctx, p, '#f4e7b4', '#e8c96a');
  else if (p.fx === 'arrow') noteRibbon(ctx, p, '#1a3a8a', '#7ec8ff');
  else if (p.fx === 'music-note' || p.fx === 'rebirth') noteComet(ctx, p);
  else if (p.fx === 'blood-note') { bloodRibbon(ctx, p); if (!liteFx) bloodSparkles(ctx, p); }
  else if (p.fx !== 'fuga' && p.fx !== 'smile-ship' && p.fx !== 'whale' && p.fx !== 'butterfly' && p.fx !== 'jewel' && p.fx !== 'shigure' && p.fx !== 'moca-dusk' && p.fx !== 'sprout' && p.fx !== 'clock' && p.fx !== 'iaido' && p.fx !== 'coffin-ring' && p.fx !== 'coffin-ring-big') {
    // 火的故事 skips the stock dots — they read as purple balls; its case draws gold afterimages.
    // 微笑号 is a screen-sized sweep, so the travelling point must not leave a dot trail.
    ctx.fillStyle = p.color;
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i], k = (i + 1) / p.trail.length;
      ctx.globalAlpha = k * .35;
      ctx.beginPath(); ctx.arc(t.x, t.y, p.radius * k * .8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.translate(p.x, p.y);
  switch (p.fx) {
    case 'coffin-ring':
    case 'coffin-ring-big': {
      // 康乃馨盛开之日: the pink ring closes on the foe — thicker and hotter as it tightens, ticks
      // pointing in — then at its smallest snaps back out as a bright burst. The big one also keeps a
      // dashed line where its burst will reach.
      const big = p.fx === 'coffin-ring-big';
      const spec = big ? RING_BIG : RING_SMALL;
      const t = p.age;
      const sc = big ? 1 : .6;
      if (t < spec.shrink) {
        const k = t / spec.shrink;
        const rad = spec.r0 + (spec.rmin - spec.r0) * k * k * (3 - 2 * k);
        // Blossoms ride the rim and open as it tightens; they shrink with it so they never crowd.
        const n = big ? 10 : 6;
        const size = Math.max(6, Math.min(big ? 34 : 18, rad * Math.PI * 2 / n * .42));
        blossomWreath(ctx, rad, n, size, .25 + k * .75, Math.min(1, t / .12) * (.5 + k * .15), t * .6);
        ctx.globalAlpha = Math.min(1, t / .08) * (.55 + k * .45);
        ctx.fillStyle = `rgba(255,143,216,${.05 + k * .12})`;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ff8fd8'; ctx.lineWidth = (3 + k * 5) * sc;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
        if (big) {
          ctx.save();
          ctx.globalAlpha *= .6;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.setLineDash([10, 12]);
          ctx.beginPath(); ctx.arc(0, 0, spec.rmax, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = Math.min(1, t / .08);
        ctx.strokeStyle = '#ffd6f4'; ctx.lineWidth = 4 * sc;
        for (let i = 0; i < 4; i++) {
          const ang = i * Math.PI / 2 + t * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * (rad + 18 * sc), Math.sin(ang) * (rad + 18 * sc));
          ctx.lineTo(Math.cos(ang) * (rad + 4 * sc), Math.sin(ang) * (rad + 4 * sc));
          ctx.stroke();
        }
      } else {
        const k = Math.min(1, (t - spec.shrink) / spec.burst);
        const rad = spec.rmin + (spec.rmax - spec.rmin) * k;
        // The burst carries the wreath out on its front, the blossoms swelling as they fade.
        const bloom = Math.min(1, (t - spec.shrink) / (spec.burst + .15));
        blossomWreath(ctx, rad, big ? 10 : 6, (big ? 34 : 18) * (1 + bloom * .5), 1, (1 - bloom) * .65 * Math.min(1, p.life / .2), spec.shrink * .6 + bloom * .8);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, p.life / .2);
        ctx.fillStyle = `rgba(255,170,226,${.35 * (1 - k * .6)})`;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10 * (1 - k * .5) * sc;
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ff8fd8'; ctx.lineWidth = 4 * sc;
        ctx.beginPath(); ctx.arc(0, 0, rad + 8 * sc, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'parry-orb': {
      // 完美格挡's counter: a soft blue glow around a white core.
      const pulse = 1 + Math.sin(p.age * 30) * .08;
      ctx.fillStyle = '#7fd8ff';
      ctx.globalAlpha = .25;
      ctx.beginPath(); ctx.arc(0, 0, p.radius * 1.9 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .7;
      ctx.beginPath(); ctx.arc(0, 0, p.radius * 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f2fcff';
      ctx.beginPath(); ctx.arc(0, 0, p.radius * .6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'arrow': {
      ctx.scale(Math.sign(p.vx) || 1, 1);
      if (!prop(ctx, images, ARROW_SRC, Math.max(p.size, 28))) {
        ctx.fillStyle = '#3d7cff';
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-12, -6);
        ctx.lineTo(-12, 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d6f4ff';
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'shigure': {
      ctx.strokeStyle = '#7ec8ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(0, 8);
      ctx.stroke();
      ctx.fillStyle = '#d6f4ff';
      ctx.beginPath();
      ctx.arc(0, 10, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'manju': {
      // 小馒头投喂: a golden bun tumbling through its lob; the stock dot trail reads as crumbs.
      ctx.rotate(p.age * 9);
      if (!prop(ctx, images, MANJU_SRC, p.size)) {
        const R = Math.max(8, p.size * .3);
        const bun = ctx.createRadialGradient(-R * .3, -R * .35, R * .1, 0, 0, R);
        bun.addColorStop(0, '#ffe8b0');
        bun.addColorStop(.55, '#f0c060');
        bun.addColorStop(1, '#c89032');
        ctx.fillStyle = bun;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a86818';
        for (let i = 0; i < 3; i++) {
          const a = i * 2.1 + 1;
          ctx.beginPath(); ctx.arc(Math.cos(a) * R * .45, Math.sin(a) * R * .45, R * .09, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'jewel': {
      // Head of the cell sits on the projectile; the tail trails behind. The tongue sits high in the cell, so the blit drops to the foot line.
      const flame = images?.get(FLAME_SRC);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      if (flame?.naturalWidth) {
        const [col, row] = flameFrame(p.age, p.life);
        ctx.drawImage(keyed(flame), col * CELL, row * CELL, CELL, CELL, -CELL, -CELL + FLAME_DROP, CELL, CELL);
        break;
      }
      const fade = Math.min(1, p.life / .2, p.age / .12);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#1a3a8a';
      ctx.beginPath();
      ctx.moveTo(-150, 0);
      ctx.quadraticCurveTo(-70, -28, 0, -8);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3d7cff';
      ctx.beginPath();
      ctx.moveTo(-120, 0);
      ctx.quadraticCurveTo(-50, -16, 0, -4);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#d6f4ff';
      ctx.beginPath();
      ctx.arc(0, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'firebird': {
      // 火鸟: the pillar sheet plays eruption → burn → embers, cell bottom pinned to the
      // stage floor. The procedural tongues are the stand-in while the sheet is a missing
      // or still-unloaded colour block.
      const pillarSheet = images?.get(PILLAR_SRC);
      if (pillarSheet?.naturalWidth) {
        const [col, row] = pillarFrame(p.age, p.life);
        ctx.drawImage(keyed(pillarSheet), col * CELL, row * CELL, CELL, CELL, -CELL / 2, -CELL, CELL, CELL);
        break;
      }
      const grow = Math.min(1, p.age / .12);
      const fade = Math.min(1, p.life / .22);
      const h = 225 * grow * (.7 + .3 * fade);
      const w = 52 * (1 + Math.sin(p.age * 21) * .08);
      const sway = Math.sin(p.age * 13) * 7;
      ctx.globalAlpha = fade;
      const tongue = (hh: number, ww: number, fill: string) => {
        ctx.beginPath();
        ctx.moveTo(-ww, 0);
        ctx.quadraticCurveTo(-ww * .9, -hh * .45, sway, -hh);
        ctx.quadraticCurveTo(ww * .9, -hh * .45, ww, 0);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      tongue(h, w, '#ff7a33');
      tongue(h * .78, w * .62, '#ffc24d');
      tongue(h * .5, w * .34, '#fff3c4');
      ctx.fillStyle = '#b83a1a';
      ctx.beginPath(); ctx.ellipse(0, 0, w * 1.15, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc24d';
      ctx.beginPath(); ctx.ellipse(0, 0, w * .8, 8, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'milk': {
      if (p.settled) ctx.translate(0, -p.size * .28);
      if (!prop(ctx, images, MILK_SRC, p.size)) {
        ctx.fillStyle = '#6b3a22';
        ctx.fillRect(-p.radius * .7, -p.radius, p.radius * 1.4, p.radius * 1.8);
        ctx.fillStyle = '#f2efe6';
        ctx.fillRect(-p.radius * .45, -p.radius * .85, p.radius * .9, p.radius * .35);
      }
      break;
    }
    case 'bag': {
      ctx.rotate(p.age * 3 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, BAG_SRC, p.size)) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.radius, -p.radius * .2);
        ctx.lineTo(-p.radius * .7, p.radius);
        ctx.lineTo(p.radius * .7, p.radius);
        ctx.lineTo(p.radius, -p.radius * .2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#151222';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-p.radius * .25, -p.radius * .55, p.radius * .35, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.radius * .25, -p.radius * .55, p.radius * .35, Math.PI, 0); ctx.stroke();
      }
      break;
    }
    case 'meat': {
      ctx.rotate(p.age * 7 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, MEAT_SRC, p.size)) {
        ctx.fillStyle = '#c44858';
        ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 1.3, p.radius * .7, .4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f4ead8';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-p.radius * .2, p.radius * .2); ctx.lineTo(p.radius * .9, -p.radius * .5); ctx.stroke();
      }
      break;
    }
    case 'smile-ship': {
      // 微笑号: one screen-wide hull. After a beat it slides fully off one side to fully off
      // the other in two seconds. ponytail: picture only — the hit is still the old point.
      const dir = Math.sign(p.vx) || 1;
      const ship = images?.get(SHIP_SRC);
      const aspect = ship?.naturalWidth ? ship.naturalHeight / ship.naturalWidth : .5;
      const w = W;
      const h = w * aspect;
      const u = Math.min(1, Math.max(0, p.age - SHIP_HOLD) / SHIP_SWEEP);
      const centerX = dir > 0 ? -w / 2 + u * (W + w) : W + w / 2 - u * (W + w);
      ctx.translate(centerX - p.x, H / 2 - p.y);
      ctx.scale(dir, 1);
      ctx.imageSmoothingEnabled = true;
      if (ship?.naturalWidth) {
        ctx.drawImage(keyed(ship), -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = '#f6f2ea';
        ctx.fillRect(-w / 2, -h * .15, w, h * .45);
        ctx.fillStyle = '#ffd94f';
        ctx.fillRect(-w * .15, -h * .42, w * .35, h * .28);
        ctx.strokeStyle = '#151222';
        ctx.lineWidth = 4;
        ctx.strokeRect(-w / 2, -h * .15, w, h * .45);
        ctx.strokeRect(-w * .15, -h * .42, w * .35, h * .28);
      }
      break;
    }
    case 'juggle-ball': {
      ctx.rotate(p.age * 9 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, BALL_SRC, p.size)) {
        const r = p.size / 2;
        ctx.fillStyle = '#f6f2ea';
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d94455';
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * .38, .5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#151222';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'smile-wave': {
      // 世界微笑: the shout family of stacked crescents, grinning — a golden wave with the
      // corners turned up, drawn by hand when the sheet has not landed yet.
      const r = Math.max(40, p.size * .85);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      if (!prop(ctx, images, WAVE_SRC, p.size)) {
        ctx.strokeStyle = p.color;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = (1 - i * .28) * .95;
          ctx.lineWidth = 9 - i * 2.5;
          ctx.beginPath();
          ctx.arc(-r * .3 - i * r * .22, 0, r - i * 12, -1.15, 1.15);
          ctx.stroke();
        }
        ctx.globalAlpha = .9;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, r * .08, r * .42, .35, Math.PI - .35);
        ctx.stroke();
      }
      break;
    }
    case 'groove-note': {
      if (!prop(ctx, images, YUNO_NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#EE5577';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'jerky': {
      ctx.rotate(p.age * 6 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, CHUCHU_JERKY_SRC, p.size)) {
        ctx.fillStyle = '#8a4b28';
        ctx.fillRect(-p.radius * 1.4, -p.radius * .35, p.radius * 2.8, p.radius * .7);
      }
      break;
    }
    case 'trash': {
      const s = Math.max(9, p.size * .38);
      ctx.translate(0, -s);
      ctx.rotate(p.age * 8 * Math.sign(p.vx || 1));
      ctx.fillStyle = '#f7f7f7';
      ctx.strokeStyle = '#8d8d8d';
      ctx.lineWidth = Math.max(1.4, s * .16);
      ctx.lineJoin = 'round';
      const ring: [number, number][] = [
        [-1.05, -.15], [-.55, -.95], [.25, -1.05], [1, -.4],
        [.9, .45], [.25, 1], [-.6, .85], [-1.05, .3],
      ];
      ctx.beginPath();
      ctx.moveTo(ring[0][0] * s, ring[0][1] * s);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0] * s, ring[i][1] * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-.45 * s, -.25 * s);
      ctx.lineTo(.1 * s, .15 * s);
      ctx.lineTo(.55 * s, -.15 * s);
      ctx.moveTo(-.15 * s, .2 * s);
      ctx.lineTo(.25 * s, .55 * s);
      ctx.stroke();
      break;
    }
    case 'cake': {
      if (!prop(ctx, images, CHUCHU_CAKE_SRC, p.size)) {
        ctx.fillStyle = '#fff6ee';
        ctx.beginPath(); ctx.ellipse(0, 0, p.radius, p.radius * .55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e23b4a';
        ctx.beginPath(); ctx.arc(-p.radius * .35, -p.radius * .1, p.radius * .16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.radius * .1, -p.radius * .2, p.radius * .16, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.radius * .4, 0, p.radius * .16, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'cucumber': {
      ctx.rotate(p.age * 8 * Math.sign(p.vx || 1));
      if (!prop(ctx, images, CUCUMBER_SRC, p.size)) {
        ctx.fillStyle = '#3f8c45';
        ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 1.4, p.radius * .45, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2f6a34';
        ctx.beginPath(); ctx.arc(p.radius, 0, p.radius * .28, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-p.radius, 0, p.radius * .28, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'mutsumi-note': {
      if (!prop(ctx, images, NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#e7a0b8';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'chord': {
      if (!prop(ctx, images, ANON_NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#ff4f96';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'sob': {
      // A cream note with a tear; the trail dots above already carry her colour.
      if (!prop(ctx, images, SOYO_NOTE_SRC, p.size)) {
        const s = Math.max(7, p.radius);
        ctx.fillStyle = '#e8c96a';
        ctx.fillRect(s * .4, -s * 1.28, s * .18, s * 1.38);
        ctx.beginPath(); ctx.ellipse(-s * .08, s * .18, s * .58, s * .36, -.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * .52, s * .3);
        ctx.bezierCurveTo(s * .3, s * .95, s * .66, s * 1.05, s * .56, s * .55);
        ctx.fill();
      }
      break;
    }
    case 'shout': {
      // 为什么要演奏春日影: three stacked crescents leaning into the travel, notes riding the front.
      const r = Math.max(40, p.size * .85);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      ctx.strokeStyle = p.color;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - i * .28) * .95;
        ctx.lineWidth = 9 - i * 2.5;
        ctx.beginPath();
        ctx.arc(-r * .3 - i * r * .22, 0, r - i * 12, -1.15, 1.15);
        ctx.stroke();
      }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = .9;
      const note = (ny: number) => {
        ctx.fillRect(r * .18, ny - 11, 3, 11);
        ctx.beginPath(); ctx.ellipse(r * .12, ny, 5, 3.4, -.5, 0, Math.PI * 2); ctx.fill();
      };
      note(-r * .45);
      note(r * .3);
      break;
    }
    case 'abuse': {
      // 离灯远点: a jagged speech bubble, three cold dots inside, wobbling as it flies.
      ctx.rotate(p.age * 2 * Math.sign(p.vx || 1));
      const r = Math.max(14, p.radius);
      ctx.fillStyle = '#171120';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 11; i++) {
        const ang = (i / 11) * Math.PI * 2;
        const rad = r * (i % 2 ? 1.22 : .95);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.color;
      for (const dx of [-r * .38, 0, r * .38]) {
        ctx.beginPath(); ctx.arc(dx, 0, r * .13, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'bubble': {
      // 才没有喜欢你呢: a blush-pink speech bubble wobbles ahead, "!?" scrawled inside.
      ctx.rotate(p.age * 2.4 * Math.sign(p.vx || 1));
      const r = Math.max(14, p.radius);
      ctx.fillStyle = '#fff5fa';
      ctx.strokeStyle = '#e86ba4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.12, r * .92, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * .5, r * .62);
      ctx.lineTo(-r * .78, r * 1.24);
      ctx.lineTo(-r * .12, r * .84);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e86ba4';
      ctx.font = `900 ${Math.round(r * 1.1)}px ${UI_FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!?', 0, r * .04);
      break;
    }
    case 'heart': {
      ctx.rotate(p.age * 2);
      if (!prop(ctx, images, HEART_SRC, p.size)) {
        const s = Math.max(8, p.radius);
        ctx.fillStyle = '#ff4f96';
        ctx.beginPath();
        ctx.moveTo(0, s * .7);
        ctx.bezierCurveTo(-s * 1.3, -s * .2, -s * .5, -s * 1.1, 0, -s * .45);
        ctx.bezierCurveTo(s * .5, -s * 1.1, s * 1.3, -s * .2, 0, s * .7);
        ctx.fill();
      }
      break;
    }
    case 'donut-straw':
    case 'donut-choc': {
      // 甜甜圈: the flavour image spins gently as it flies; the rings are the missing-file stand-in.
      ctx.rotate(p.age * 3 * Math.sign(p.vx || 1));
      const straw = p.fx === 'donut-straw';
      if (prop(ctx, images, straw ? DONUT_STRAW_SRC : DONUT_CHOC_SRC, p.size)) break;
      const r = Math.max(14, p.radius);
      ctx.fillStyle = straw ? '#f2a2b8' : '#8a5230';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#151222';
      ctx.beginPath(); ctx.arc(0, 0, r * .36, 0, Math.PI * 2); ctx.fill();
      if (straw) {
        ctx.fillStyle = '#fff2f8';
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4 + .5, rr = r * .66;
          ctx.fillRect(Math.cos(a) * rr - 2.5, Math.sin(a) * rr - 1.2, 5, 2.4);
        }
      }
      break;
    }
    case 'wink': {
      // 偶像魅力: a huge heart that pulses as it drifts, slow enough to read the whole flight.
      const pulse = 1 + Math.sin(p.age * 6) * .07;
      ctx.scale(pulse * (Math.sign(p.vx) || 1), pulse);
      if (!prop(ctx, images, MANA_HEART_SRC, p.size)) {
        const s = Math.max(12, p.radius);
        ctx.fillStyle = '#ff5f9e';
        ctx.beginPath();
        ctx.moveTo(0, s * .9);
        ctx.bezierCurveTo(-s * 1.5, -s * .3, -s * .6, -s * 1.35, 0, -s * .55);
        ctx.bezierCurveTo(s * .6, -s * 1.35, s * 1.5, -s * .3, 0, s * .9);
        ctx.fill();
        ctx.strokeStyle = '#ffd9ec';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      break;
    }
    case 'matcha': {
      // 抹茶熔岩: the dollop image spins gently as it flies; the circles are the missing-file stand-in.
      ctx.rotate(p.age * 4 * Math.sign(p.vx || 1));
      if (prop(ctx, images, MATCHA_SRC, p.size)) break;
      const r = Math.max(10, p.radius);
      ctx.fillStyle = '#3e7d46';
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const rad = r * (1.06 + Math.sin(ang * 3 + p.age * 9) * .12);
        const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#77DD77';
      ctx.beginPath(); ctx.arc(-r * .25, -r * .3, r * .38, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f9ee';
      ctx.beginPath(); ctx.arc(r * .3, -r * .15, r * .16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    // 左右开弓: the stick she lets go of, end over end.
    case 'stick': {
      ctx.rotate(p.age * 24 * (Math.sign(p.vx) || 1));
      drumstick(ctx, 48);
      break;
    }
    case 'blood-note': {
      // 血月的奏鸣: a soft red bloom under the note so it reads on the darkened stage.
      if (!liteFx) {
        const R = Math.max(7, p.radius) * 2.4;
        ctx.fillStyle = noteBloom(ctx, R);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      }
      // Drawn half again the hit size so the note carries the eye; the hit circle stays the data's.
      ctx.scale(1.5, 1.5);
      ctx.rotate(Math.sin(p.age * 5 + (p.wave ?? 0)) * .25);
      noteGlyph(ctx, Math.max(7, p.radius), p.color, '#3a0a14', '#ffe6e8');
      break;
    }
    case 'shiro': {
      // 忘却之影: the 白祥 stands where she was, faint and lit blue at the rim; it flickers before it goes.
      const left = OBLIVION.fuse - p.age;
      const warn = left < OBLIVION.flicker;
      let alpha = .7 * Math.min(1, p.age / .12);
      if (warn && Math.floor(p.age * 22) % 2) alpha *= .35;
      const h = p.size;
      drawShiroFloor(ctx, p, liteFx);
      ctx.scale(p.face ?? 1, 1);
      ctx.globalAlpha = alpha;
      if (!liteFx && !phoneRaster()) {
        ctx.shadowColor = '#9fc4ff';
        ctx.shadowBlur = warn ? 30 : 16;
      }
      const im = images?.get(SHIRO_SRC);
      if (im?.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = phoneRaster() ? 'low' : 'high';
        ctx.drawImage(keyed(im), -h / 2, -h, h, h);
      } else {
        ctx.fillStyle = '#e8f0ff';
        ctx.beginPath(); ctx.ellipse(0, -h * .45, h * .16, h * .4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -h * .86, h * .1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      break;
    }
    case 'rain-note':
    case 'note': {
      if (p.fx === 'rain-note') rainTrail(ctx, p);
      noteGlyph(ctx, Math.max(7, p.radius), p.color);
      break;
    }
    // 让大家幸福的音乐: 音符彗星. A lit sphere holds a near-white note; the band behind is
    // drawn by noteComet in the character's colour.
    // 重生之乐音 rides the same comet — the colour comes from each caster's rep colour.
    case 'music-note':
    case 'rebirth': {
      const base = rgbOf(p.color);
      const hot = mixRgb(base, [255, 255, 255], .85);
      const R = Math.max(9, Math.min(22, p.size * .42));
      const pulse = .92 + Math.sin(p.age * 9) * .08;
      // Bloom around the ball.
      const bloom = ctx.createRadialGradient(0, 0, R * .1, 0, 0, R * 2.4 * pulse);
      bloom.addColorStop(0, cssRgba(base, .5));
      bloom.addColorStop(.45, cssRgba(base, .2));
      bloom.addColorStop(1, cssRgba(base, 0));
      ctx.fillStyle = bloom;
      ctx.beginPath(); ctx.arc(0, 0, R * 2.4 * pulse, 0, Math.PI * 2); ctx.fill();
      // The ball itself: a lit sphere, not a flat disc.
      const body = ctx.createRadialGradient(-R * .32, -R * .38, R * .08, 0, 0, R);
      body.addColorStop(0, cssRgba(hot, .95));
      body.addColorStop(.4, cssRgba(mixRgb(base, hot, .5), .55));
      body.addColorStop(1, cssRgba(base, .16));
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      // Rim plus one highlight arc that travels around the sphere.
      ctx.strokeStyle = cssRgba(hot, .9);
      ctx.lineWidth = Math.max(1, R * .09);
      ctx.beginPath(); ctx.arc(0, 0, R * .98, 0, Math.PI * 2); ctx.stroke();
      const a0 = p.age * 6.5;
      ctx.strokeStyle = cssRgba(hot, .55);
      ctx.lineWidth = Math.max(1, R * .08);
      ctx.beginPath(); ctx.arc(0, 0, R * .8, a0, a0 + 1.15); ctx.stroke();
      // The note: near-white outline so it reads on the lit ball.
      const s = R * .74;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const note = (color: string, w: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.ellipse(-s * .2, s * .48, s * .4, s * .28, -.42, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * .16, s * .4); ctx.lineTo(s * .16, -s * .78); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * .16, -s * .78); ctx.quadraticCurveTo(s * .82, -s * .6, s * .64, -s * .08); ctx.stroke();
      };
      note(cssRgba(base, .55), Math.max(3, s * .38));
      note('rgba(255,255,255,.96)', Math.max(1.3, s * .14));
      break;
    }
    case 'stone': {
      // 飞砾谱: a pebble with a crayon star, tumbling as it flies.
      if (!prop(ctx, images, STONE_SRC, p.size)) {
        ctx.rotate(p.age * 7 * Math.sign(p.vx || 1));
        const r = p.radius;
        ctx.fillStyle = '#b9b2ad';
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * .8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#948d88';
        ctx.beginPath(); ctx.ellipse(-r * .25, r * .15, r * .45, r * .3, .4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(r * .1, -r * .5); ctx.lineTo(r * .32, 0); ctx.lineTo(r * .1, r * .5); ctx.lineTo(-r * .12, 0);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'blackhole': {
      // 奇独点: a face-on circular well — black core, purple spiral arms curling inward, pale specks falling in.
      const span = p.skill.life ?? 1.4;
      const r = Math.max(40, p.size * 1.2 * (1 - .3 * Math.min(1, p.age / span)));
      const base = Math.min(1, p.life * 3);
      ctx.globalAlpha = base;
      ctx.fillStyle = '#0c0918';
      ctx.beginPath(); ctx.arc(0, 0, r * .48, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3d2a6b';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * .5, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a0 = p.age * 3.2 + (i * Math.PI * 2) / 3;
        let prev: [number, number] | null = null;
        for (let s = 0; s <= 12; s++) {
          const t = s / 12;
          const ang = a0 - t * 3.6;
          const rad = r * (.95 - .52 * t);
          const cur: [number, number] = [Math.cos(ang) * rad, Math.sin(ang) * rad];
          if (prev) {
            ctx.globalAlpha = base * (.8 - t * .5);
            ctx.strokeStyle = t > .55 ? '#a98be0' : '#6d3fb8';
            ctx.lineWidth = 4.5 - t * 3;
            ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
          }
          prev = cur;
        }
      }
      ctx.fillStyle = '#e6d9ff';
      for (let i = 0; i < 4; i++) {
        const t = (p.age * .7 + i / 4) % 1;
        const ang = p.age * 2.6 + i * 1.57;
        const rad = r * (1 - t * .92);
        ctx.globalAlpha = base * (1 - t) * .9;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, 2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'mega': {
      // 高音量！: megaphone waves — three stacked crescents leaning into the travel, a hot leading edge.
      const r = Math.max(40, p.size * .85);
      ctx.scale(Math.sign(p.vx) || 1, 1);
      ctx.strokeStyle = p.color;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (1 - i * .28) * .95;
        ctx.lineWidth = 9 - i * 2.5;
        ctx.beginPath();
        ctx.arc(-r * .3 - i * r * .22, 0, r - i * 12, -1.15, 1.15);
        ctx.stroke();
      }
      ctx.strokeStyle = '#fffbe0';
      ctx.globalAlpha = .9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-r * .3, 0, r, -1.0, 1.0);
      ctx.stroke();
      break;
    }
    case 'seal': {
      // 九字真言: on a body the circle grows along its flight, trailing edge fixed.
      const grown = sealSwell(p.size, p.vx, p.swell ?? 0);
      ctx.translate(grown.shift, 0);
      if (prop(ctx, images, SEAL_SRC, p.size * grown.scale)) break;
      const rad = (p.radius + 6) * grown.scale;
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .35;
      ctx.beginPath(); ctx.arc(0, 0, rad * .72, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .9;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        const x = Math.cos(ang) * rad * .62;
        const y = Math.sin(ang) * rad * .62;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'snip': {
      // 剪: the standing void field — a slow wheel of body-height spindle slashes over the spot.
      const r = Math.max(46, p.size * .8);
      const spin = p.age * .9;
      const specs = [
        { a: 0, d: r * .35, l: 172, w: 11 },
        { a: 1.5, d: r * .18, l: 190, w: 13 },
        { a: 2.7, d: r * .42, l: 156, w: 9 },
        { a: 4.1, d: r * .12, l: 168, w: 10 },
        { a: 5.3, d: r * .3, l: 180, w: 12 },
      ];
      for (const s of specs) {
        const a = s.a + spin;
        ctx.save();
        ctx.translate(Math.cos(a) * s.d, Math.sin(a) * s.d * .55);
        ctx.rotate(a + Math.PI / 2 + Math.sin(p.age * 2 + s.a) * .3);
        ctx.globalAlpha = Math.min(1, p.life * 4) * (.5 + .3 * Math.sin(p.age * 5 + s.a * 3));
        slashSpindle(ctx, s.l, s.w, '#d9c7f8', '#241433');
        ctx.restore();
      }
      break;
    }
    case 'fuga': {
      // 火的故事: the slow arrow — a burning bolt with a hot head, pointing the way it flies.
      // Behind it, flat gold copies of the arrow fade along the flight history (the stock dot
      // trail is skipped for fuga); local x is divided back out of the mirror so leftward
      // flights keep their ghosts behind them.
      const sx = Math.sign(p.vx) || 1;
      ctx.scale(sx, 1);
      const aim = images?.get(FUGA_ARROW_SRC);
      const gold = aim?.naturalWidth ? tintedSilhouette(keyed(aim), aim.naturalWidth, aim.naturalHeight, '#ffd257') : null;
      if (gold && p.trail.length > 2) {
        for (let i = 0; i < 3; i++) {
          const t = p.trail[Math.max(0, p.trail.length - 40 + i * 15)];
          if (!t) continue;
          ctx.save();
          ctx.globalAlpha = .12 + i * .09;
          ctx.drawImage(gold, (t.x - p.x) * sx - p.size / 2, (t.y - p.y) - p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }
      if (!prop(ctx, images, FUGA_ARROW_SRC, p.size)) {
        const len = p.size * .8;
        ctx.globalAlpha = .8;
        ctx.fillStyle = '#ff9a4d';
        ctx.beginPath();
        ctx.moveTo(-len * .5, -7);
        ctx.quadraticCurveTo(-len * .1, -15, len * .32, -6);
        ctx.lineTo(len * .32, 6);
        ctx.quadraticCurveTo(-len * .1, 15, -len * .5, 7);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd9a8';
        ctx.beginPath();
        ctx.moveTo(len * .58, 0);
        ctx.lineTo(len * .26, -8);
        ctx.lineTo(len * .26, 8);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'star': {
      // 小星星: the shared star sprite tumbling along the diagonal. Procedural fallback keeps
      // the draw alive before the prop loads.
      ctx.rotate(p.age * 5 * Math.sign(p.vx || 1));
      if (prop(ctx, images, KASUMI_STAR_SRC, Math.max(18, p.size))) break;
      ctx.fillStyle = '#ffd257';
      starPath(ctx, Math.max(9, p.size * .5));
      ctx.fill();
      ctx.strokeStyle = '#b46a1e';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(-p.size * .12, -p.size * .14, Math.max(2.4, p.size * .1), 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'star-fall': {
      // 星之鼓动: the wish star rides the diagonal — streaks lean against the velocity, the
      // art sits above the hit centre so the lower point touches the floor right as it lands.
      const r = p.size * .5;
      ctx.save();
      ctx.rotate(Math.atan2(-(p.vx || 0), p.vy || 1));
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 3;
      ctx.globalAlpha = .5;
      for (let i = -1; i <= 1; i++) {
        const x = i * r * .34;
        ctx.beginPath();
        ctx.moveTo(x, -r * 1.15);
        ctx.lineTo(x + i * 4, -r * 1.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.translate(0, -p.size * .32);
      ctx.rotate(p.age * .8);
      if (prop(ctx, images, KASUMI_STAR_SRC, p.size * 1.06)) break;
      ctx.fillStyle = '#ffd257';
      starPath(ctx, r);
      ctx.fill();
      ctx.strokeStyle = '#b46a1e';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.arc(-r * .16, -r * .2, r * .14, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'moca-bubble': {
      ctx.scale(Math.sign(p.vx) || 1, 1);
      const w = (p.size ?? 78) * .45;
      const h = w * .42;
      ctx.fillStyle = '#e8fff8';
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#e8fff8';
      ctx.beginPath();
      ctx.moveTo(-w * .35, h * .45);
      ctx.lineTo(-w * .85, h * .15);
      ctx.lineTo(-w * .15, h * .1);
      ctx.fill();
      const step = Math.floor(p.age * 3) % 3;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i === step ? 1 : .35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(-w * .35 + i * w * .32, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'moca-die': {
      const s = 14;
      ctx.rotate(p.age * 8 * Math.sign(p.vx || 1));
      ctx.fillStyle = '#f4f0e6';
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = '#151222';
      [[-5, -5], [5, -5], [-5, 5], [5, 5], [0, 0]].forEach(([x, y], i) => {
        ctx.globalAlpha = i === 4 ? .2 : 1;
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case 'moca-dusk': {
      ctx.scale(Math.sign(p.vx) || 1, 1);
      const w = (p.size ?? 140) * .9;
      const ground = FLOOR - p.y;
      const grad = duskGrad(ctx, p.color, w);
      const n = 7, pitch = w * 1.2 / n, bw = pitch * .58, dx = 5, dy = 4;
      for (let i = 0; i < n; i++) {
        const x = -w + i * pitch;
        const top = ground - (34 + 46 * (.5 + .5 * Math.sin(p.age * 9 + i * 1.3)));
        ctx.fillStyle = grad;
        ctx.fillRect(x, top, bw, ground - top);
        ctx.beginPath();
        ctx.moveTo(x + bw, top); ctx.lineTo(x + bw + dx, top - dy); ctx.lineTo(x + bw + dx, ground - dy); ctx.lineTo(x + bw, ground);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, top); ctx.lineTo(x + dx, top - dy); ctx.lineTo(x + bw + dx, top - dy); ctx.lineTo(x + bw, top);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.fill();
      }
      break;
    }
    case 'hana': {
      // 花道·缠: a spinning blossom. The trail dots behind it come from the stock loop.
      const s = (p.size ?? 46) * .3;
      ctx.rotate(p.age * 7 * Math.sign(p.vx || 1));
      for (let i = 0; i < 5; i++) {
        ctx.save();
        ctx.rotate((i / 5) * Math.PI * 2);
        ctx.fillStyle = '#2a2230';
        ctx.beginPath(); ctx.ellipse(0, -s * .8, s * .42, s * .8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, -s * .8, s * .32, s * .7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffe6f0';
      ctx.beginPath(); ctx.arc(0, 0, s * .34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd257';
      ctx.beginPath(); ctx.arc(0, 0, s * .16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'jelly': {
      if (p.hue && !phoneRaster()) ctx.filter = `hue-rotate(${p.hue}deg)`;
      if (!prop(ctx, images, JELLY_SRC, p.size)) {
        ctx.fillStyle = '#9ec0ee';
        ctx.beginPath(); ctx.ellipse(0, p.radius * .35, p.radius, p.radius * .35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.radius, p.radius * .2);
        ctx.quadraticCurveTo(0, -p.radius * 1.3, p.radius, p.radius * .2);
        ctx.quadraticCurveTo(0, p.radius * .05, -p.radius, p.radius * .2);
        ctx.fill();
      }
      break;
    }
    case 'whale': {
      // 地面遮罩：低于脚线的部分不画，鲸鱼从地里涌出再沉回去。
      const ground = FLOOR - p.y;
      ctx.beginPath();
      ctx.rect(-W, ground - H, W * 2, H);
      ctx.clip();
      ctx.rotate(Math.atan2(p.vy, p.vx || 1));
      if (!prop(ctx, images, WHALE_SRC, p.size ?? 512)) {
        const r = 48;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(10, 0, r * 1.7, r * .7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(-r * 2.3, -r * .55); ctx.lineTo(-r * 2.3, r * .55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#151222';
        ctx.beginPath(); ctx.arc(r * 1.15, -r * .12, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'butterfly': {
      // 蝶变: inner seven, plus seven evenly around them. One hitbox.
      const dir = Math.sign(p.vx || 1);
      ctx.scale(dir, 1);
      ctx.globalAlpha = .9;
      const wing = (i: number, x: number, y: number) => {
        const phase = p.age * 5 + i * 2.1;
        const open = .25 + .75 * (.5 + .5 * Math.sin(p.age * 22 + i * 1.9));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(.35 + Math.sin(phase) * .3);
        drawButterfly(ctx, open);
        ctx.restore();
      };
      for (let i = 0; i < 7; i++) {
        const phase = p.age * 5 + i * 2.1;
        wing(i, ((i * 2) % 7 - 3) * 10 + Math.sin(phase) * 14, ((i * 3) % 7 - 3) * 8 + Math.cos(phase * 1.3) * 4);
      }
      for (let i = 0; i < 7; i++) {
        const phase = p.age * 5 + (i + 7) * 2.1;
        const ang = (i / 7) * Math.PI * 2 - Math.PI / 2;
        wing(i + 7, Math.cos(ang) * 72 + Math.sin(phase) * 6, Math.sin(ang) * 50 + Math.cos(phase * 1.3) * 4);
      }
      break;
    }
    case 'sprout': {
      if (!prop(ctx, images, SPROUT_SRC, p.size)) {
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(-6, -8, 12, 28);
        ctx.fillStyle = '#C4A574';
        ctx.beginPath();
        ctx.ellipse(0, -16, 12, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'clock': {
      // Same shape as the retired 256-cell sheet, scaled into p.size the way prop() did.
      if (p.hue) ctx.rotate(.7);
      const k = Math.max(16, p.size) / 256;
      const x = (sx: number) => (sx - 128) * k;
      const y = (sy: number) => (sy - 128) * k;
      ctx.fillStyle = '#f4f4f6';
      ctx.beginPath();
      ctx.arc(x(114), y(62), 16 * k, 0, Math.PI * 2);
      ctx.arc(x(142), y(62), 16 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EE7788';
      ctx.fillRect(x(108), y(70), 10 * k, 22 * k);
      ctx.fillRect(x(138), y(70), 10 * k, 22 * k);
      ctx.beginPath();
      ctx.arc(x(128), y(148), 72 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff4f6';
      ctx.beginPath();
      ctx.arc(x(128), y(148), 52 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#151222';
      ctx.lineWidth = 6 * k;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x(128), y(148));
      ctx.lineTo(x(128), y(112));
      ctx.moveTo(x(128), y(148));
      ctx.lineTo(x(156), y(148));
      ctx.stroke();
      break;
    }
    case 'iaido': {
      // 剑道三连 wave: the same crescent blade riding the shot, fading as it dies.
      ctx.scale(Math.sign(p.vx) || 1, 1);
      const R = Math.max(18, p.size * .62);
      const fade = Math.min(1, p.life / .18);
      ctx.globalAlpha = fade;
      ctx.lineCap = 'round';
      ctx.fillStyle = '#cdb8ff';
      arcBladePath(ctx, -6, 0, R, -1.25, .9, 7);
      ctx.fill();
      ctx.fillStyle = '#f5f0ff';
      arcBladePath(ctx, -6, 0, R - 1, -1.25, .9, 3.6);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-6, 0, R, -1.25, .9); ctx.stroke();
      break;
    }
    case 'wail':
    case 'orb':
    default: {
      ctx.rotate(p.age * 6 * Math.sign(p.vx));
      ctx.fillStyle = '#151222';
      ctx.fillRect(-p.radius - 2, -p.radius - 2, p.radius * 2 + 4, p.radius * 2 + 4);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
      ctx.fillStyle = '#fff9e6';
      ctx.fillRect(-p.radius * .4, -p.radius * .4, p.radius * .8, p.radius * .8);
    }
  }
  ctx.restore();
}

/** 改变世界：音游长按条。圆点飞到第一个人身前就停在对方中心，不再穿过去。
 *  对方按住格挡时，圆心快速间歇地向外放光。几何只来自 holdNoteSpan。 */
export function drawHoldNote(ctx: CanvasRenderingContext2D, f: Fighter, foes: Fighter[]): void {
  const a = f.attack;
  const span = a && holdNoteSpan(a, f, foes);
  if (!a || !span) return;
  const [tail, head] = span;
  const t = a.t - a.skill.start;
  const h = 15;
  const lite = liteFx;
  const release = (tail - NOTE_FROM) / (a.skill.range - NOTE_FROM);
  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y - 80));
  ctx.scale(f.facing, 1);
  const capsule = () => {
    ctx.beginPath();
    ctx.moveTo(tail, -h);
    ctx.lineTo(head, -h);
    ctx.arc(head, 0, h, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(tail, h);
    ctx.arc(tail, 0, h, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (!lite) {
    ctx.lineWidth = h * 2 + 14;
    ctx.strokeStyle = 'rgba(0, 170, 255, .12)';
    ctx.beginPath();
    ctx.moveTo(tail, 0);
    ctx.lineTo(head, 0);
    ctx.stroke();
  }
  // 条身：半透明蓝，上浅下深一点点
  const body = ctx.createLinearGradient(0, -h, 0, h);
  body.addColorStop(0, 'rgba(150, 228, 255, .44)');
  body.addColorStop(.5, 'rgba(20, 175, 255, .28)');
  body.addColorStop(1, 'rgba(0, 125, 235, .4)');
  capsule();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(190, 240, 255, .75)';
  ctx.stroke();
  if (!lite) {
    // 箭头光纹从尾流向头；相位跟着地面走，尾巴松开时不跳
    ctx.save();
    capsule();
    ctx.clip();
    const gap = 46;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(230, 250, 255, .32)';
    ctx.beginPath();
    for (let x = NOTE_FROM + (t * 280) % gap - gap; x < head + gap; x += gap) {
      ctx.moveTo(x - 6, -h * .5);
      ctx.lineTo(x + 2, 0);
      ctx.lineTo(x - 6, h * .5);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, .4)';
    ctx.beginPath();
    ctx.moveTo(tail, -h * .55);
    ctx.lineTo(head, -h * .55);
    ctx.stroke();
    ctx.restore();
  }
  if (release > 0) {
    // 尾判：松开后尾端一道白线，扫过谁谁就解开
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(235, 250, 255, .9)';
    ctx.beginPath();
    ctx.moveTo(tail, -h + 2);
    ctx.lineTo(tail, h - 2);
    ctx.stroke();
  } else if (!lite) {
    // 尾端跟着双手打碟的节拍（.14s 一换手）亮
    const beat = .5 + .5 * Math.sin(t * Math.PI / .14);
    const src = ctx.createRadialGradient(tail, 0, 0, tail, 0, h * 1.8);
    src.addColorStop(0, `rgba(200, 240, 255, ${(.3 + .25 * beat).toFixed(3)})`);
    src.addColorStop(1, 'rgba(0, 187, 255, 0)');
    ctx.fillStyle = src;
    ctx.beginPath();
    ctx.arc(tail, 0, h * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // 按住长条：圆点停在对方中心，从圆心快速间歇地向外放光
  let pressing = false;
  for (const o of foes) {
    if (a.hit.has(o.id) || !noteCaught(a, o.id) || !holdsNote(o, f)) continue;
    const along = (o.x - f.x) * f.facing;
    if (Math.abs(along - head) < 8) pressing = true;
  }
  // 头：白芯蓝边的圆点。出手时从小弹开，尾巴追上来时胀亮
  const r = 17 * Math.min(1, .5 + t / .12) * (1 + release * .3);
  if (!lite) {
    const halo = ctx.createRadialGradient(head, 0, 0, head, 0, r * 2.2);
    halo.addColorStop(0, `rgba(170, 235, 255, ${(.45 + release * .4).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(0, 187, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(head, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (head >= a.skill.range - .5) {
      const p = (t / .45) % 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(120, 215, 255, ${(.5 * (1 - p)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(head, 0, r + p * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const core = ctx.createRadialGradient(head - r * .3, -r * .3, 0, head, 0, r);
  core.addColorStop(0, 'rgba(255, 255, 255, .95)');
  core.addColorStop(1, 'rgba(90, 205, 255, .85)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(head, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#00BBFF';
  ctx.stroke();
  if (pressing) {
    const period = .11;
    for (let i = 0; i < 2; i++) {
      const p = (t / period + i * .5) % 1;
      if (p > .55) continue;
      const u = p / .55;
      ctx.beginPath();
      ctx.lineWidth = 2.5 * (1 - u) + .5;
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.9 * (1 - u)).toFixed(3)})`;
      ctx.arc(head, 0, r * .3 + u * (70 - r * .3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 仓鼠队长: the wheel is a separate picture. She only runs inside it.
    wheel.png ink is 885px of 1024, so this size sits 8px taller than her body.
    Remeasure that box if the wheel art changes. */
const WHEEL_INK = 885 / 1024;

export function drawWheel(ctx: CanvasRenderingContext2D, f: Fighter, images?: ImageCache): void {
  const a = f.attack;
  if (!a || a.t < a.skill.start) return;
  const body = f.data.view.kind === 'sprite' ? f.data.view.height : 170;
  const size = Math.round((body + 8) / WHEEL_INK);
  const spin = a.t * 8 * f.facing;
  ctx.save();
  ctx.translate(f.x, f.y - body / 2);
  ctx.rotate(spin);
  if (!prop(ctx, images, WHEEL_SRC, size)) {
    ctx.strokeStyle = '#C4A574';
    ctx.lineWidth = 10;
    const rad = (body + 8) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-rad * .85, 0);
    ctx.lineTo(rad * .85, 0);
    ctx.moveTo(0, -rad * .85);
    ctx.lineTo(0, rad * .85);
    ctx.stroke();
    ctx.fillStyle = '#EE7788';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 二叶三姐妹: a small copy of her sheet. Not a fighter, so nothing draws a bar over her head. */
const SISTER_SCALE = .62;

export function drawSister(ctx: CanvasRenderingContext2D, p: Projectile, owner: Fighter, view: FighterView): void {
  const dir = Math.sign(p.vx) || 1;
  const col = 1 + Math.floor(p.age * 8) % 4;
  const x = p.x;
  const y = p.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(SISTER_SCALE, SISTER_SCALE);
  ctx.translate(-x, -y);
  if (!phoneRaster()) ctx.filter = p.hue ? 'hue-rotate(-26deg)' : 'hue-rotate(22deg)';
  view.draw(ctx, owner, x, y, 1, undefined, undefined, { sheet: 'common', col, row: 0, facing: dir });
  ctx.restore();
}

/** 我要拉黑他: the prohibition sign over a banned fighter — pulsing, blinking out its last second. */
export function drawBanSign(ctx: CanvasRenderingContext2D, f: Fighter): void {
  const left = f.ban;
  if (left < 1 && Math.floor(left * 8) % 2 === 0) return;
  const pulse = 1 + Math.sin(left * 9) * .06;
  const r = 20 * pulse;
  const x = f.x, y = f.y - 218;
  ctx.save();
  ctx.globalAlpha = .92;
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * .68, y + r * .68);
  ctx.lineTo(x + r * .68, y - r * .68);
  ctx.stroke();
  ctx.globalAlpha = .3;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(f.x, f.y, 44, 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/* ---- 彩虹色: a watercolor wash behind her head, plus hexagonal bokeh around it ----
   The wash follows Tyler Hobbs' watercolour method (subdivide a polygon, push the new edge
   points with Gaussian noise, then fill many low-alpha copies), after johnburnmurdoch's MIT
   JavaScript port. The bokeh follows Rob Dawson's codebox/bokeh (MIT): 3D positions whose
   distance sets size, saturation and edge brightness. Both are reimplemented for canvas 2D. */

const RAINBOW_HUES = [345, 28, 55, 120, 175, 215, 275];
const WASH_BLOBS = 7;
const WASH_LAYERS = 12;
const WASH_R = 85;
/** Baked at 2 px per world unit; the blit is one image instead of 84 polygon fills per frame. */
const WASH_PX = 512;
const WASH_SPAN = WASH_PX / 2;

/** Sum of three uniforms: a cheap deterministic normal-ish value for the edge deformation. */
function wobble(seed: number): number {
  return (noise01(seed) + noise01(seed + 11.3) + noise01(seed + 27.7) - 1.5) * 1.6;
}

/** Subdivide every edge at a perturbed midpoint. Two rounds turn an octagon into a brush edge. */
function deform(points: number[][], factor: number, seed: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    out.push(p);
    out.push([
      (p[0] + q[0]) / 2 + wobble(seed + i * 2.7) * Math.abs(p[0] - q[0]) * factor,
      (p[1] + q[1]) / 2 + wobble(seed + i * 2.7 + 1.3) * Math.abs(p[1] - q[1]) * factor,
    ]);
  }
  return out;
}

/** The wash is baked once per effect: the deformed, low-alpha copies never change shape. */
const washCache = new WeakMap<Effect, HTMLCanvasElement | null>();

function buildWash(e: Effect): HTMLCanvasElement | null {
  if (typeof document === 'undefined') { washCache.set(e, null); return null; }
  const cv = document.createElement('canvas');
  cv.width = cv.height = WASH_PX;
  const g = cv.getContext('2d');
  if (!g) { washCache.set(e, null); return null; }
  g.translate(WASH_PX / 2, WASH_PX / 2);
  g.scale(2, 2);
  const seed = e.x * .37 + e.y * .11 + (e.fighter ?? 0) * 17;
  for (let b = 0; b < WASH_BLOBS; b++) {
    const a = b / WASH_BLOBS * Math.PI * 2 + noise01(b + 1) * .9;
    const d = (.08 + noise01(b + 7) * .38) * WASH_R;
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d * .72;
    const rr = WASH_R * (.3 + noise01(b + 13) * .22);
    const base = Array.from({ length: 8 }, (_, i) => {
      const t = i / 8 * Math.PI * 2 + Math.PI / 8;
      return [cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * .86];
    });
    // Low alpha per copy; the differing outlines blend into a soft, pigmented cloud.
    g.fillStyle = `hsla(${RAINBOW_HUES[b]}, 60%, 76%, .022)`;
    for (let l = 0; l < WASH_LAYERS; l++) {
      const s = seed + b * 31 + l * 7;
      const pts = deform(deform(base, .5, s), .4, s + 101);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
      g.closePath();
      g.fill();
    }
  }
  washCache.set(e, cv);
  return cv;
}

/** The halo is centred on the crown, not the chest, so it follows her head as she moves. */
function rainbowHead(f: Fighter): { x: number; y: number } {
  const h = f.data.view.kind === 'sprite' ? f.data.view.height : 170;
  return { x: f.x, y: f.y - h * .86 };
}

/** Entry blooms outward from the head; the exit snaps back to the centre over its last 0.2s. */
function rainbowPhase(e: Effect): { age: number; spread: number; fade: number } {
  const age = e.max - e.life;
  const enter = Math.min(1, age / .3);
  const grow = 1 - (1 - enter) ** 3;
  const exit = Math.min(1, e.life / .2);
  return { age, spread: (.18 + .82 * grow) * (.06 + .94 * exit), fade: Math.min(1, age / .1, e.life / .25) };
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = rot + k * Math.PI / 3;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Pre-rendered bokeh: soft halo, hexagonal aperture with a brighter rim, tiny hot centre.
    One 256px sprite per hue; the six-blade shape is rotated when it is blitted. */
const bokehSprites = new Map<number, HTMLCanvasElement | null>();

function bokehSprite(index: number): HTMLCanvasElement | null {
  const hit = bokehSprites.get(index);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') { bokehSprites.set(index, null); return null; }
  const S = 256, C = S / 2, R = 40, hue = RAINBOW_HUES[index];
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) { bokehSprites.set(index, null); return null; }
  const halo = g.createRadialGradient(C, C, R * .4, C, C, C);
  halo.addColorStop(0, `hsla(${hue}, 58%, 84%, .34)`);
  halo.addColorStop(.55, `hsla(${hue}, 58%, 84%, .12)`);
  halo.addColorStop(1, `hsla(${hue}, 58%, 84%, 0)`);
  g.fillStyle = halo;
  g.beginPath(); g.arc(C, C, C, 0, Math.PI * 2); g.fill();

  const disc = g.createRadialGradient(C, C, 0, C, C, R);
  disc.addColorStop(0, `hsla(${hue}, 58%, 84%, .2)`);
  disc.addColorStop(.62, `hsla(${hue}, 58%, 84%, .16)`);
  disc.addColorStop(.88, `hsla(${hue}, 58%, 84%, .6)`);
  disc.addColorStop(1, `hsla(${hue}, 58%, 84%, 0)`);
  hexagon(g, C, C, R, 0);
  g.fillStyle = disc;
  g.fill();
  g.strokeStyle = `hsla(${hue}, 58%, 96%, .5)`;
  g.lineWidth = 4;
  g.stroke();

  g.fillStyle = `hsla(${hue}, 33%, 97%, .55)`;
  g.beginPath(); g.arc(C, C, R * .16, 0, Math.PI * 2); g.fill();
  bokehSprites.set(index, cv);
  return cv;
}

/** Per-point depth and motion, fixed for the session; only the clock moves them. */
const BOKEH = Array.from({ length: 14 }, (_, i) => {
  const front = noise01(i + 41) >= .5;
  const z = front ? .15 + noise01(i + 23) * .3 : .55 + noise01(i + 23) * .45;
  const near = 1 - z;
  return {
    front, near,
    angle: noise01(i + 1) * Math.PI * 2,
    dist: 22 + noise01(i + 7) * 74,
    r0: 2.4 + noise01(i + 5) * 4.2,
    drift: (noise01(i + 31) - .5) * (10 + near * 16),
    rise: 4 + near * 9,
    rot0: noise01(i + 9) * Math.PI,
    rotSpeed: .3 + noise01(i + 11) * .5,
    phase: noise01(i + 19) * Math.PI * 2,
    occl: noise01(i + 37) * Math.PI * 2,
    hue: i % RAINBOW_HUES.length,
  };
});

/** The wash and the far bokeh, painted before the body so both sit behind her. */
export function drawRainbowBack(ctx: CanvasRenderingContext2D, e: Effect, f: Fighter): void {
  if (f.hp <= 0) return;
  const { spread, fade } = rainbowPhase(e);
  const { x: cx, y: cy } = rainbowHead(f);
  let wash = washCache.get(e);
  if (wash === undefined) wash = buildWash(e);
  if (wash) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(spread, spread);
    ctx.globalAlpha = fade;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(wash, -WASH_SPAN / 2, -WASH_SPAN / 2, WASH_SPAN, WASH_SPAN);
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, WASH_R * .9);
    glow.addColorStop(0, `rgba(255,255,255,${.12 * fade})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, WASH_R * .9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  drawRainbowBokeh(ctx, e, f, false);
}

/** The near bokeh, painted after the body so it floats in front of her. */
export function drawRainbowFront(ctx: CanvasRenderingContext2D, e: Effect, f: Fighter): void {
  if (f.hp <= 0) return;
  drawRainbowBokeh(ctx, e, f, true);
}

/** 3D-depth bokeh: nearer lights are bigger, brighter and more saturated; far ones softer. */
function drawRainbowBokeh(ctx: CanvasRenderingContext2D, e: Effect, f: Fighter, front: boolean): void {
  const { age, spread, fade } = rainbowPhase(e);
  const { x: cx, y: cy } = rainbowHead(f);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const b of BOKEH) {
    if (b.front !== front) continue;
    const d = b.dist * spread * (.82 + b.near * .3);
    const x = Math.cos(b.angle) * d + b.drift * age + Math.sin(age * 1.4 + b.phase) * 2;
    const y = Math.sin(b.angle) * d * .72 - b.rise * age + Math.cos(age * 1.1 + b.phase) * 2;
    const r = b.r0 * spread * (.7 + b.near * .95);
    if (r < .5) continue;
    const sprite = bokehSprite(b.hue);
    if (!sprite) continue;
    const twinkle = .72 + .28 * Math.sin(age * 6 + b.phase);
    // A brief occlusion, like a light passing behind a body.
    const occluded = Math.sin(age * 7.3 + b.occl) > .93 ? .35 : 1;
    const size = r * 6.4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(b.rot0 + age * b.rotSpeed);
    ctx.globalAlpha = fade * twinkle * occluded;
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.restore();
}

/** Grow a draw about a world point. Scale 1 is a no-op, so the stage coordinates stay put. */
export function zoomAbout(ctx: CanvasRenderingContext2D, scale: number, x: number, y: number, paint: () => void): void {
  if (scale === 1) { paint(); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
  paint();
  ctx.restore();
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], scale = 1): void {
  const lite = liteFx;
  for (const p of particles) {
    // Lite keeps about half. vx never changes after the spawn, so a particle never blinks.
    if (lite && Math.floor(Math.abs(p.vx)) & 1) continue;
    ctx.globalAlpha = Math.min(1, p.life * 5);
    ctx.fillStyle = p.color;
    const x = Math.round(p.x), y = Math.round(p.y);
    zoomAbout(ctx, scale, x + p.size / 2, y + p.size / 2, () => ctx.fillRect(x, y, p.size, p.size));
  }
  ctx.globalAlpha = 1;
}

/** Resting size is 1. On a body the circle is 70% larger, and only along its flight. */
export function sealSwell(size: number, vx: number, swell = 0): { scale: number; shift: number } {
  const scale = 1 + 0.7 * swell;
  return { scale, shift: Math.sign(vx || 1) * size * (scale - 1) / 2 };
}

/** 九字真言, one brush character per beat. The blank tail is the gap before the next character. */
export const KUJI = '临兵斗者皆阵烈在前';
export const KUJI_STEP = 0.072;

export function kujiFlash(t: number): { ch: string; alpha: number } | null {
  if (t < 0) return null;
  const i = Math.floor(t / KUJI_STEP);
  if (i >= KUJI.length) return null;
  const k = t / KUJI_STEP - i;
  if (k >= 0.84) return null;
  if (k < 0.18) return { ch: KUJI[i], alpha: k / 0.18 };
  if (k < 0.62) return { ch: KUJI[i], alpha: 1 };
  return { ch: KUJI[i], alpha: 1 - (k - 0.62) / 0.22 };
}

export function drawKuji(ctx: CanvasRenderingContext2D, g: FightGame, scale = 1): void {
  for (const f of g.fighters) {
    const a = f.attack;
    if (!a || a.skill.fx !== 'seal' || f.hp <= 0) continue;
    const flash = kujiFlash(a.t);
    if (!flash) continue;
    const h = f.data.view.kind === 'sprite' ? f.data.view.height : 176;
    // Super windup hair starts 58px down the 256 cell. Baseline sits a few pixels above that.
    const head = (CELL - 58) * h / CELL;
    zoomAbout(ctx, scale, f.x, f.y, () => drawKujiGlyph(ctx, f.x, f.y - head - 6, flash));
  }
}

function drawKujiGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, flash: { ch: string; alpha: number }): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
    ctx.globalAlpha = flash.alpha;
    const s = rasterScale(ctx);
    const baked = s && cacheText(kujiBakes, flash.ch + '|' + s, () => bakeText(KUJI_FONT, 48, flash.ch, 4, '#241433', '#e6d4ff', 'bottom', s, 'round'));
    if (baked) blitText(ctx, baked, 0, 0);
    else {
      ctx.font = KUJI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#241433';
      ctx.strokeText(flash.ch, 0, 0);
      ctx.fillStyle = '#e6d4ff';
    ctx.fillText(flash.ch, 0, 0);
  }
  ctx.restore();
}

const KUJI_FONT = '48px "Ma Shan Zheng", KaiTi, STKaiti, serif';
const kujiBakes = new Map<string, BakedText>();

/** Stroke+fill text rasterised once into its own canvas. Re-stroking CJK glyphs every frame
 *  was the floating-number cost on old phones; a blit is one quad. */
interface BakedText { c: HTMLCanvasElement; w: number; h: number; base: number; s: number }

/** Raster pixels per world unit under the current transform; 0 off the DOM (selfcheck). */
function rasterScale(ctx: CanvasRenderingContext2D): number {
  if (typeof document === 'undefined' || !ctx.getTransform) return 0;
  const m = ctx.getTransform();
  return Math.round(Math.hypot(m.a, m.b) * 100) / 100;
}

/** ponytail: kuji keys are 9 glyphs × a few raster scales, so the map stays tiny; cap at 64 in case the window keeps resizing. */
function cacheText(cache: Map<string, BakedText>, key: string, bake: () => BakedText): BakedText {
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size >= 64) cache.clear();
    hit = bake();
    cache.set(key, hit);
  }
  return hit;
}

/** World-unit box padded on every side for the stroke; `base` is the baseline's y inside it.
 *  The width is rounded up to whole raster pixels so the blit lands 1:1. */
function bakeText(font: string, px: number, text: string, lw: number, stroke: string, fill: string, baseline: 'alphabetic' | 'bottom', s: number, join: CanvasLineJoin = 'miter'): BakedText {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  // Miter joins on sharp glyph corners poke out several stroke widths; round joins stay within one.
  const pad = join === 'round' ? lw : lw * 3;
  const h = Math.ceil((px * 1.4 + pad * 2) * s) / s;
  if (!g) return { c, w: 0, h, base: 0, s };
  g.font = font;
  const w = Math.ceil((g.measureText(text).width + pad * 2) * s) / s;
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const base = h - pad - (baseline === 'alphabetic' ? px * .3 : 0);
  g.scale(s, s);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = baseline;
  g.lineJoin = join;
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.strokeText(text, w / 2, base);
  g.fillStyle = fill;
  g.fillText(text, w / 2, base);
  return { c, w, h, base, s };
}

/** Anchor (x, y) is the text's centre on its baseline, snapped to the raster grid. */
function blitText(ctx: CanvasRenderingContext2D, b: BakedText, x: number, y: number): void {
  ctx.drawImage(b.c, Math.round((x - b.w / 2) * b.s) / b.s, Math.round((y - b.base) * b.s) / b.s, b.w, b.h);
}

const LIME = new Set(['#b7ff6e']);
export const UI_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

/** Floating texts cycle a handful of sizes; the font string is built once per (weight, px). */
const fontCache = new Map<string, string>();
function floatingFont(lime: boolean, size: number): string {
  const px = lime ? Math.round(size * 1.2) : size;
  const key = (lime ? 'b' : 'h') + px;
  let font = fontCache.get(key);
  if (!font) {
    font = `${lime ? 700 : 900} ${px}px ${UI_FONT}`;
    fontCache.set(key, font);
  }
  return font;
}

/** A floating text never changes its words, colour or size, so each one bakes once per raster scale. */
const textBakes = new WeakMap<FloatingText, BakedText>();

export function drawTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[], scale = 1): void {
  ctx.textAlign = 'center';
  for (const t of texts) {
    zoomAbout(ctx, scale, t.x, t.y, () => drawFloatingText(ctx, t));
  }
  ctx.globalAlpha = 1;
}

function drawFloatingText(ctx: CanvasRenderingContext2D, t: FloatingText): void {
  const s = rasterScale(ctx);
  const lime = LIME.has(t.color);
  ctx.globalAlpha = Math.min(1, t.life * 4);
  if (s) {
    let b = textBakes.get(t);
    if (!b || b.s !== s) {
      b = bakeText(floatingFont(lime, t.size), lime ? Math.round(t.size * 1.2) : t.size, t.text, lime ? 6 : 4, lime ? '#000' : '#171120', lime ? '#fff' : t.color, 'alphabetic', s);
      textBakes.set(t, b);
    }
    blitText(ctx, b, t.x, t.y);
    return;
  }
  ctx.font = floatingFont(lime, t.size);
  ctx.lineWidth = lime ? 6 : 4;
  ctx.strokeStyle = lime ? '#000' : '#171120';
  ctx.strokeText(t.text, t.x, t.y);
  ctx.fillStyle = lime ? '#fff' : t.color;
  ctx.fillText(t.text, t.x, t.y);
}

export function drawCombo(ctx: CanvasRenderingContext2D, g: FightGame, baseline = 205): void {
  for (const f of g.fighters) {
    if (f.minion || f.echo || f.combo <= 1 || f.comboTime <= 0) continue;
    const left = f.team === 0;
    const slot = g.fighters.filter(m => m.team === f.team).indexOf(f);
    const x = left ? 42 : 918, y = baseline + slot * 36;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.font = 'italic 45px Impact, sans-serif';
    ctx.fillStyle = SIDE[f.team];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(f.combo + ' HIT', x, y);
    ctx.fillText(f.combo + ' HIT', x, y);
    ctx.font = `12px ${UI_FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(f.combo >= 5 ? 'NICE COMBO!' : 'COMBO', x, y + 20);
  }
}

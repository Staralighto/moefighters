import type { Effect } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { H, W, clamp } from '../game/constants.ts';
import { BIKE_SEAT_X, CELL, LOCK_BAND_COLORS } from './clips.ts';
import { drawBike, wheelSpin } from './maskingFx.ts';
import { TAU, burst, dot, easeOut, glow, hash, petal, sparkle, stampText, streak } from './fxParticles.ts';

/* LOCK（朝日六花）. Two registers, matching her two looks:
   - street clothes: the round glasses, the red flower scrunchie, soft and small;
   - the stage: sound. In costume every J / K throws a neon-blue wave; the shouts and the super throw colourful
     waves with a little street graffiti on them (ink outlines, spray puffs, paint runs, thrown-up tags), and the
     super has the Galaxy's lights in the colours of the bands she brought there.
   Cheap by construction: every graffiti piece (spray, drip, tags) is baked once per colour into a small canvas and
   blitted; a wave is one path stroked three times (ink, colour, highlight; or halo, core, white for the neon).
   No shadowBlur, no per-frame gradients outside the five spotlights, and lite mode halves the counts.
   护六出动 borrows MASKING's bike drawing (maskingFx.ts) and MASKING herself from her own special sheet. */

/** Painted under every body. */
export const LOCK_BACK: readonly string[] = ['lock-rescue-ride'];
/** Screen space, behind every body: the house lights down, then Galaxy's spotlights. */
export const LOCK_SCREEN_BACK: readonly string[] = ['lock-dim', 'lock-galaxy'];

const LIME = '#AAEE22';
const LIME_RGB = '170,238,34';
const FRAME = '#2a2833';
const FLOWER = '#e2353f';
const GOLD = '#EEBB44';
/** MASKING as she stands in her own view (characters.ts height 180, lift 0), and her riding cell (U, hit row). */
const MASKING_SHEET = '/sprites/masking/special.png';
const BIKE_SRC = '/sprites/masking/bike.png';
const MASKING_H = 180;

let lite = false;
const n = (full: number) => (lite ? Math.ceil(full / 2) : full);
const bump = (t: number) => Math.sin(Math.PI * clamp(t, 0, 1));

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

/** Her round glasses, about `s` wide, centred; a white glint across the front lens. */
function glasses(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = Math.max(1.6, s * .11);
  const r = s * .24;
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * s * .27, 0, r, 0, TAU); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-s * .05, -r * .2); ctx.lineTo(s * .05, -r * .2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = Math.max(1, s * .06);
  ctx.beginPath(); ctx.moveTo(s * .17, -r * .5); ctx.lineTo(s * .33, r * .35); ctx.stroke();
  ctx.restore();
}

/** A five-point star of outer radius r. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * .45 : r;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/* ---- 街头涂鸦: baked once per colour, then every frame is a blit ---- */

const INK = '#15121c';
/** The spray-can palette the colourful waves cycle through. */
const GRAFF = ['#AAEE22', '#FF3EA5', '#2FD3FF', '#FFE13A', '#A46BFF'] as const;
/** The costume's swings: deep blue, sky, ice. */
const BLUE = ['#2457ff', '#2fb0ff', '#a6ecff'] as const;
const bakes = new Map<string, HTMLCanvasElement | null>();
function bake(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, color: string, kind: number) => void, color: string, kind = 0): HTMLCanvasElement | null {
  const hit = bakes.get(key);
  if (hit !== undefined) return hit;
  let c: HTMLCanvasElement | null = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    if (g) { draw(g, color, kind); c = cv; }
  }
  bakes.set(key, c);
  return c;
}
/** A spray-paint puff, 96 px: dense in the middle, speckled at the rim. */
function spray(color: string): HTMLCanvasElement | null {
  return bake('spray|' + color, 96, 96, paintSpray, color);
}
function paintSpray(g: CanvasRenderingContext2D, color: string): void {
  g.fillStyle = color;
  for (let i = 0; i < 240; i++) {
    const a = hash(i, 301) * TAU, d = hash(i, 302) ** 1.7 * 46;
    g.globalAlpha = .3 + .7 * (1 - d / 48);
    g.beginPath(); g.arc(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, Math.max(.6, .8 + hash(i, 303) * 2.4 * (1 - d / 48)), 0, TAU); g.fill();
  }
}
/** A paint run, 48×96: a blob with three drips hanging off it. */
function drip(color: string): HTMLCanvasElement | null {
  return bake('drip|' + color, 48, 96, paintDrip, color);
}
function paintDrip(g: CanvasRenderingContext2D, color: string): void {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(24, 14, 21, 11, 0, 0, TAU); g.fill();
  for (const [x, len, w] of [[10, 50, 4], [25, 82, 5.5], [38, 38, 3.5]]) {
    g.beginPath();
    g.moveTo(x - w, 14); g.lineTo(x - w * .75, len); g.arc(x, len, w * .85, Math.PI, 0, true); g.lineTo(x + w, 14);
    g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath(); g.ellipse(17, 10, 6, 3, -.3, 0, TAU); g.fill();
}
/** Tags thrown up beside a piece, 72 px: 0 star, 1 bolt, 2 crown, 3 arrow, 4 burst. A hard ink shadow, a thick
 *  ink outline, flat colour and one white glint. */
const TAGS = 5;
function tagShape(g: CanvasRenderingContext2D, kind: number): void {
  const poly = (pts: readonly number[]) => {
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1]));
    g.closePath();
  };
  if (kind === 0) star(g, 0, 0, 27, .2);
  else if (kind === 1) poly([-6, -28, 14, -28, 4, -6, 18, -6, -10, 28, -3, 3, -16, 3]);
  else if (kind === 2) poly([-25, 15, -25, -12, -12, 1, 0, -22, 12, 1, 25, -12, 25, 15]);
  else if (kind === 3) poly([-27, -7, 3, -7, 3, -19, 27, 0, 3, 19, 3, 7, -27, 7]);
  else {
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, rr = i % 2 ? 12 : 27;
      (i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    g.closePath();
  }
}
function tag(kind: number, color: string): HTMLCanvasElement | null {
  return bake('tag' + kind + '|' + color, 72, 72, paintTag, color, kind);
}
function paintTag(g: CanvasRenderingContext2D, color: string, kind: number): void {
  g.translate(34, 34);
  g.lineJoin = 'round';
  g.save(); g.translate(4, 4); tagShape(g, kind); g.fillStyle = INK; g.fill(); g.restore();
  tagShape(g, kind);
  g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  g.fillStyle = color; g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.arc(-8, -9, 3.4, 0, TAU); g.fill();
}
/** A baked piece centred on (x, y), `w` wide (height keeps its aspect), turned `rot`. */
function blit(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement | null, x: number, y: number, w: number, rot = 0, sy = 1): void {
  if (!c || !(w > 0)) return;
  const h = w * c.height / c.width * sy;
  if (!rot) { ctx.drawImage(c, x - w / 2, y - h / 2, w, h); return; }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.restore();
}
/** A tag that pops in (overshoot), drifts along (dx, dy) and fades: `u` is 0..1 over its life. */
function popTag(ctx: CanvasRenderingContext2D, kind: number, color: string, x: number, y: number, size: number, u: number, dx: number, dy: number, rot: number): void {
  if (u <= 0 || u >= 1) return;
  const pop = u < .18 ? easeOut(u / .18) * 1.25 : 1.25 - .25 * clamp((u - .18) / .15, 0, 1);
  ctx.globalAlpha = 1 - clamp((u - .65) / .35, 0, 1);
  blit(ctx, tag(kind % TAGS, color), x + dx * easeOut(u), y + dy * easeOut(u), size * pop, rot * (1 - u * .5));
}

/** A wobbly arc of sound round the origin, facing right: radius r, half-span, wobble amp × waves, phase. */
function waveArc(ctx: CanvasRenderingContext2D, r: number, span: number, amp: number, waves: number, ph: number): void {
  // About one point per 6° (a full ring ~60), halved in lite: enough that a big ring never shows its corners.
  const m = Math.max(10, Math.round(span * (lite ? 10 : 19)));
  // A small arc wobbles less, so a wave just leaving the mouth reads as a ripple, not a squiggle.
  amp *= clamp(r / 90, .2, 1);
  ctx.beginPath();
  for (let i = 0; i <= m; i++) {
    const k = i / m, a = -span + 2 * span * k;
    const rr = r + amp * Math.sin(k * waves * TAU + ph);
    (i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr));
  }
}
/** A standing wave from y0 to y1 at x: a vertical ribbon of sound (the super's headbangs). */
function waveWall(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, amp: number, ph: number): void {
  const m = lite ? 8 : 14;
  ctx.beginPath();
  for (let i = 0; i <= m; i++) {
    const k = i / m, y = y0 + (y1 - y0) * k;
    const px = x + amp * Math.sin(k * 1.6 * TAU + ph) * Math.sin(k * Math.PI);
    (i ? ctx.lineTo(px, y) : ctx.moveTo(px, y));
  }
}
/** Graffiti line: the current path stroked in ink, then the colour, then a white highlight down the middle. */
function inked(ctx: CanvasRenderingContext2D, w: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = w + 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke();
  ctx.globalAlpha = alpha * .8;
  ctx.lineWidth = Math.max(1, w * .26); ctx.strokeStyle = '#ffffff'; ctx.stroke();
}
/** Neon line (the costume's blue): a wide faint halo, the core, a white filament. Additive; restores source-over. */
function neon(ctx: CanvasRenderingContext2D, w: number, color: string, alpha: number): void {
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * .3; ctx.lineWidth = w * 3; ctx.stroke();
  ctx.globalAlpha = alpha; ctx.lineWidth = w; ctx.stroke();
  ctx.globalAlpha = alpha * .9; ctx.lineWidth = Math.max(1, w * .32); ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

export function drawLockFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('lock-')) return false;
  lite = liteFx;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const r = e.radius ?? 100;
  ctx.save();
  switch (e.type) {
    case 'lock-hair': {
      // 狂化 J / K: a neon-blue wave of sound thrown off the headbang — two rippling arcs on J; three bigger ones on
      // K, with equalizer bars jumping at the front and a ripple on the floor. Anchored at the head (combat.ts swingFx
      // stamps it ahead of her at chest height; step back to the body).
      const heavy = !!e.heavy;
      ctx.translate(e.x - dir * r * .55 + dir * 18, e.y - 22);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const arcs = heavy ? 3 : 2, reach = r * (heavy ? 1.25 : 1.05), span = heavy ? .85 : .65;
      for (let i = 0; i < arcs; i++) {
        const u = clamp((el - i * .045) / (heavy ? .3 : .24), 0, 1);
        if (u <= 0 || u >= 1) continue;
        waveArc(ctx, 18 + easeOut(u) * reach, span * (.7 + .3 * u), (heavy ? 7 : 5) * (1 - u * .5), 1.5, el * 30 + i * 2);
        neon(ctx, (heavy ? 13 : 9) * (1 - u * .7) + 2, BLUE[i % 2], (1 - u) * .95);
      }
      if (heavy) {
        // Equalizer bars at the front of the wave, and the floor answering.
        ctx.globalCompositeOperation = 'lighter';
        const u = clamp(el / .3, 0, 1);
        const fx = 30 + easeOut(u) * reach * .8;
        for (let i = 0; i < n(6); i++) {
          const h = (10 + 34 * Math.abs(Math.sin(el * 26 + i * 1.9))) * (1 - u);
          ctx.globalAlpha = (1 - u) * .85;
          ctx.fillStyle = BLUE[i % 3];
          ctx.fillRect(fx + i * 8 - 24, 6 - h / 2, 4.5, h);
        }
        ctx.globalAlpha = (1 - u) * .7;
        ctx.strokeStyle = BLUE[1];
        ctx.lineWidth = 4 * (1 - u) + 1;
        ctx.beginPath(); ctx.ellipse(r * .35, 130, 30 + easeOut(u) * reach * .7, 7 + 6 * u, 0, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      if (e.hit) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - clamp(el / .25, 0, 1)) * .55;
        blit(ctx, spray(BLUE[1]), reach * .85, 8, heavy ? 90 : 64);
        burst(el, 81, { n: n(heavy ? 12 : 7), speed: [140, 320], life: .3, drag: .3 }, (x, y, kk, i) => {
          ctx.globalAlpha = 1 - kk;
          ctx.fillStyle = i % 3 ? BLUE[2] : '#ffffff';
          if (i % 2) sparkle(ctx, x, y, 5 * (1 - kk)); else dot(ctx, x, y, 2.2);
        }, reach * .85, 8);
      }
      break;
    }
    case 'lock-unseal': {
      // 限制器解除: the glasses go up spinning, the flower scrunchie comes apart into petals, and a ring of her
      // lime knocks the space around her open. The comeback (e.hit) adds a white ring and more light.
      const head = e.y - 150;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - clamp(el / .25, 0, 1)) * .8;
      glow(ctx, e.x, head, 70, '255,255,255');
      ctx.globalAlpha = bump(el / .7) * .45;
      glow(ctx, e.x, e.y - 90, 110, LIME_RGB);
      // Light running up the loosened hair.
      ctx.strokeStyle = LIME;
      ctx.lineCap = 'round';
      for (let i = 0, m = n(7); i < m; i++) {
        const u = clamp((el - i * .03) / .45, 0, 1);
        if (u <= 0 || u >= 1) continue;
        const x = e.x + (hash(i, 61) - .5) * 70;
        const y0 = e.y - 20 - hash(i, 62) * 60 - u * 120;
        ctx.globalAlpha = bump(u) * .75;
        ctx.lineWidth = 2;
        streak(ctx, x, y0, x, y0 - 34, 2);
      }
      // The ring(s) on the floor and round the body.
      const rings = e.hit ? 2 : 1;
      for (let i = 0; i < rings; i++) {
        const u = clamp((el - i * .08) / .4, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.globalAlpha = (1 - u) * .9;
        ctx.strokeStyle = i ? '#ffffff' : LIME;
        ctx.lineWidth = 7 * (1 - u) + 1.5;
        ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, r * easeOut(u), r * .22 * easeOut(u), 0, 0, TAU); ctx.stroke();
        ctx.lineWidth = 4 * (1 - u) + 1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y - 95, r * .55 * easeOut(u), 110 * easeOut(u), 0, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      // The scrunchie: a little red flower that bursts into petals off the back of her head.
      burst(el, 63, { n: n(12), speed: [70, 210], life: .9, gravity: 230, drag: .25 }, (x, y, kk, i) => {
        ctx.globalAlpha = 1 - kk * kk;
        petal(ctx, x, y, 7 * (1 - kk * .4), el * 6 + i, i % 4 ? FLOWER : '#ffd34d');
      }, e.x - dir * 22, head + 8);
      // The glasses: up, turning over and over, and down behind her.
      if (el < .85) {
        const u = el / .85;
        const gx = e.x - dir * 70 * u;
        const gy = head - 150 * u + 260 * u * u;
        glasses(ctx, gx, gy, 30, dir * u * 9, 1 - clamp((u - .7) / .3, 0, 1));
        if (u < .3) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (1 - u / .3) * .9;
          ctx.fillStyle = '#ffffff';
          sparkle(ctx, gx + 10, gy - 6, 12);
        }
      }
      break;
    }
    case 'lock-reseal': {
      // 戴回眼镜: the glasses come down onto her face; a glint, and her lime settles off her like dust.
      const head = e.y - 150;
      const u = clamp(el / .2, 0, 1);
      glasses(ctx, e.x + dir * 10, head - 70 * (1 - easeOut(u)), 26, 0, Math.min(1, el / .08) * (1 - clamp((el - .45) / .2, 0, 1)));
      ctx.globalCompositeOperation = 'lighter';
      if (el > .18) {
        const k = clamp((el - .18) / .3, 0, 1);
        ctx.globalAlpha = (1 - k) * .9;
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, e.x + dir * 18, head - 4, 16 * (1 - k * .5));
        ctx.globalAlpha = (1 - k) * .5;
        glow(ctx, e.x, e.y - 90, 90, '255,255,255');
      }
      burst(el, 64, { n: n(14), speed: [20, 70], life: .7, gravity: 120, drag: .4 }, (x, y, kk, i) => {
        ctx.globalAlpha = (1 - kk) * .8;
        ctx.fillStyle = i % 3 ? LIME : '#ffffff';
        dot(ctx, x, y, 2);
      }, e.x, e.y - 110);
      break;
    }
    case 'lock-shout': {
      // 给我安静听着: colourful waves of sound from her mouth with a bit of street graffiti on them — ink-outlined
      // ripples in spray-can colours, a puff of paint where the shout starts, tags thrown up along the cone and
      // paint flicked off the edges. In costume (heavy): five bigger waves, more tags, a second puff.
      const heavy = !!e.heavy;
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const span = heavy ? .78 : .58;
      // The puff of paint at the mouth, under everything.
      const puff = 1 - clamp(el / (heavy ? .45 : .35), 0, 1);
      if (puff > 0) {
        ctx.globalAlpha = puff * .75;
        blit(ctx, spray(GRAFF[1]), 40, 0, (heavy ? 160 : 120) * (.6 + .4 * (1 - puff)));
        if (heavy) blit(ctx, spray(GRAFF[2]), 90, -24, 130 * (.6 + .4 * (1 - puff)));
      }
      const arcs = heavy ? 5 : 3;
      for (let i = 0; i < arcs; i++) {
        const u = clamp((el - i * .06) / .38, 0, 1);
        if (u <= 0 || u >= 1) continue;
        waveArc(ctx, 16 + easeOut(u) * r, span * (.7 + .3 * u), (heavy ? 9 : 7) * (1 - u * .4), 1.5, el * 20 + i * 1.7);
        inked(ctx, (heavy ? 16 : 12) * (1 - u * .6) + 2, GRAFF[i % GRAFF.length], 1 - u * u);
      }
      // Tags thrown up along the cone: the shout reads like a wall going up.
      const tags = heavy ? 3 : 2;
      for (let i = 0; i < tags; i++) {
        const u = (el - .05 - i * .06) / .5;
        const a = (i % 2 ? 1 : -1) * span * .55;
        const d = r * (.45 + .3 * i / tags);
        popTag(ctx, heavy ? i + 2 : i, GRAFF[(i + 1) % GRAFF.length], Math.cos(a) * d, Math.sin(a) * d - 14, heavy ? 60 : 50, u, 16, -14, (i % 2 ? .3 : -.25));
      }
      // Paint flicked off the edges.
      burst(el, heavy ? 66 : 65, { n: n(heavy ? 16 : 10), speed: [r * .9, r * 1.6], life: .4, gravity: 260, drag: .4, spread: span * 2.2, angle: 0 }, (x, y, kk, i) => {
        ctx.globalAlpha = 1 - kk;
        ctx.fillStyle = GRAFF[i % GRAFF.length];
        dot(ctx, x, y, 2.6 * (1 - kk) + .8);
      });
      break;
    }
    case 'lock-rescue-ride': {
      // 护六出动: MASKING on the 死亡银河号, rushing past. The bike is hers (maskingFx.ts); she is her own riding
      // cell. A puff of exhaust as she arrives, and two little gold hearts trailing (she does it for LOCK).
      const clock = e.age ?? el;
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.save();
      ctx.translate(BIKE_SEAT_X, Math.sin(clock * 38) * 1.2);
      drawBike(ctx, image(images, BIKE_SRC));
      wheelSpin(ctx, clock, 30);
      ctx.restore();
      const sheet = image(images, MASKING_SHEET);
      const h = MASKING_H;
      if (sheet) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(sheet, 0, CELL, CELL, CELL, -h / 2, -h, h, h);
      } else {
        ctx.fillStyle = GOLD;
        ctx.beginPath(); ctx.ellipse(0, -h * .62, h * .1, h * .2, .3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(h * .05, -h * .88, h * .08, 0, TAU); ctx.fill();
      }
      // Speed lines off the back.
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#fff2c0';
      ctx.lineCap = 'round';
      for (let i = 0, m = n(5); i < m; i++) {
        const y = -30 - hash(i, 91) * 140;
        const len = 50 + hash(i, 92) * 70;
        const x0 = -110 - ((clock * 900 + hash(i, 93) * 200) % 160);
        ctx.globalAlpha = .45;
        streak(ctx, x0, y, x0 - len, y, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 2; i++) {
        const u = (clock * 2.2 + i * .5) % 1;
        ctx.globalAlpha = (1 - u) * .9;
        ctx.fillStyle = GOLD;
        const hx = -70 - u * 90, hy = -h * .95 - u * 30 + i * 14;
        ctx.beginPath();
        ctx.moveTo(hx, hy + 4);
        ctx.bezierCurveTo(hx - 7, hy - 2, hx - 3, hy - 8, hx, hy - 4);
        ctx.bezierCurveTo(hx + 3, hy - 8, hx + 7, hy - 2, hx, hy + 4);
        ctx.fill();
      }
      break;
    }
    case 'lock-dim': {
      // The house lights go down for the set (screen space).
      ctx.globalAlpha = clamp(Math.min(el / .2, e.life / .35), 0, 1) * .55;
      ctx.fillStyle = e.color;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'lock-galaxy': {
      // Live House Galaxy: five spotlights from the rig, one per band colour, swinging slowly; their pools on
      // the floor breathe. Screen space, behind the bodies, so they light the stage and not the fighters.
      const since = el;
      const on = clamp(Math.min(since / .25, e.life / .35), 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < LOCK_BAND_COLORS.length; i++) {
        const top = W * (.12 + i * .19);
        const sway = Math.sin(since * 1.6 + i * 1.3) * .32;
        const len = H * 1.05;
        const foot = top + Math.sin(sway) * len;
        const col = LOCK_BAND_COLORS[i];
        const grad = ctx.createLinearGradient(top, 0, foot, len);
        grad.addColorStop(0, col);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = on * .28;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(top - 8, -4);
        ctx.lineTo(top + 8, -4);
        ctx.lineTo(foot + 70, len);
        ctx.lineTo(foot - 70, len);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = on * (.35 + .1 * Math.sin(since * 5 + i));
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(foot, H * .86, 70, 12, 0, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'lock-scream': {
      // 「大少女乐团时代や！」: rippling rings in every spray-can colour run across the whole stage, tags burst out of
      // her, and the line goes up like a wall piece — paint puffs behind it, runs dripping under it, a hard magenta
      // shadow and a crown on the corner.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 4; i++) {
        const u = clamp((el - i * .1) / .6, 0, 1);
        if (u <= 0 || u >= 1) continue;
        ctx.save();
        ctx.translate(e.x, e.y);
        waveArc(ctx, 24 + easeOut(u) * r, Math.PI, 14 * (1 - u * .5), 7, el * 10 + i);
        inked(ctx, 20 * (1 - u) + 4, GRAFF[i], (1 - u) * .95);
        ctx.restore();
      }
      for (let i = 0, m = n(9); i < m; i++) {
        const a = i / m * TAU + hash(i, 97) * .5;
        const d = 120 + hash(i, 98) * 240;
        popTag(ctx, i, GRAFF[i % GRAFF.length], e.x, e.y, 50 + hash(i, 99) * 22, (el - .04 - hash(i, 100) * .12) / .7, Math.cos(a) * d, Math.sin(a) * d, (hash(i, 101) - .5) * 1.4);
      }
      // The piece.
      const tx = clamp(e.x + dir * 120, 250, W - 250), ty = H * .6;
      const pop = clamp(el / .14, 0, 1);
      const size = 46 * (pop < 1 ? .4 + 1.0 * easeOut(pop) : 1 + .08 * Math.max(0, 1 - (el - .14) / .12));
      const shake = el < .4 ? Math.sin(el * 90) * 3 * (1 - el / .4) : 0;
      const hold = Math.min(1, e.life / .25);
      ctx.globalAlpha = hold * .8 * pop;
      blit(ctx, spray(GRAFF[1]), tx - 120, ty + 4, 300, 0, .55);
      blit(ctx, spray(GRAFF[2]), tx + 140, ty - 2, 260, 0, .55);
      // Runs dripping down from under the letters.
      const run = easeOut(clamp((el - .12) / .6, 0, 1));
      ctx.globalAlpha = hold;
      for (let i = 0; i < 3; i++) {
        if (run <= 0) break;
        const c = drip(i === 1 ? GRAFF[1] : LIME);
        const dx = tx + (i - 1) * 150 + (hash(i, 102) - .5) * 40;
        if (c) ctx.drawImage(c, dx - 14, ty + 6, 28, 56 * run);
      }
      stampText(ctx, '大少女乐团时代や！', tx + shake + 5, ty + 6, size, GRAFF[1], INK);
      stampText(ctx, '大少女乐团时代や！', tx + shake, ty, size, LIME, INK);
      popTag(ctx, 2, GRAFF[3], tx + 205, ty - 30, 42, (el - .1) / Math.max(.6, e.max - .1), 0, -6, .25);
      break;
    }
    case 'lock-bang': {
      // One headbang: a standing wall of sound in that band's colour rides out ahead of her, with an echo behind,
      // a puff of the colour at her head, a tag riding the wave's front and paint flicking off it.
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const col = e.color;
      const i = e.n ?? 0;
      const puff = 1 - clamp(el / .3, 0, 1);
      if (puff > 0) { ctx.globalAlpha = puff * .85; blit(ctx, spray(col), 0, -10, 170 * (1.2 - .4 * puff)); }
      const u = clamp(el / .5, 0, 1);
      const x = 30 + easeOut(u) * r;
      waveWall(ctx, x - 56, -170, 100, 18, el * 24 + 1);
      inked(ctx, 11 * (1 - u) + 3, col, (1 - u) * .6);
      waveWall(ctx, x, -200, 120, 26, el * 24);
      inked(ctx, 24 * (1 - u) + 6, col, (1 - u) * .95);
      popTag(ctx, i, col === '#FFEE22' ? GRAFF[2] : col, x + 10, -228, 60, el / .55, 0, -14, (i % 2 ? .3 : -.3));
      burst(el, 70 + i, { n: n(10), speed: [180, 360], life: .4, gravity: 300, drag: .3, angle: 0, spread: 1.6 }, (px, py, kk, j) => {
        ctx.globalAlpha = 1 - kk;
        ctx.fillStyle = j % 3 ? col : '#ffffff';
        dot(ctx, px, py, 2.8 * (1 - kk) + .8);
      }, x, -30);
      break;
    }
    case 'lock-star': {
      // The last bang: a big graffiti star in Poppin'Party's colour (she is their biggest fan) — hard ink shadow,
      // ink outline, a lighter heart and a glint — slapped over a burst of paint, runs dripping off it, and one tag
      // in each band's colour flung out round it.
      ctx.translate(e.x, e.y);
      const pop = clamp(el / .16, 0, 1);
      const s = r * (pop < 1 ? 1.25 * easeOut(pop) : 1.25 - .25 * clamp((el - .16) / .2, 0, 1));
      const fade = 1 - clamp((el - .6) / .5, 0, 1);
      ctx.globalAlpha = fade * .85;
      blit(ctx, spray(e.color), -20, 6, s * 2.4);
      blit(ctx, spray(LIME), 40, -24, s * 1.6);
      const run = easeOut(clamp((el - .15) / .7, 0, 1));
      const d = drip(e.color);
      if (d && run > 0) {
        ctx.globalAlpha = fade;
        ctx.drawImage(d, -s * .45, s * .25, s * .34, s * .7 * run);
        ctx.drawImage(d, s * .12, s * .3, s * .28, s * .55 * run);
      }
      ctx.lineJoin = 'round';
      const rot = el * .6;
      ctx.globalAlpha = fade;
      star(ctx, 7, 8, s * .62, rot); ctx.fillStyle = INK; ctx.fill();
      star(ctx, 0, 0, s * .62, rot);
      ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = e.color; ctx.fill();
      star(ctx, 0, 0, s * .32, rot); ctx.fillStyle = '#ffd8a8'; ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-s * .16, -s * .2, s * .06, 0, TAU); ctx.fill();
      // A rippling ring of her lime, and the five tags flung out.
      ctx.lineCap = 'round';
      const u = clamp(el / .55, 0, 1);
      if (u < 1) {
        waveArc(ctx, s * .5 + easeOut(u) * r * 1.3, Math.PI, 10 * (1 - u), 10, el * 10);
        inked(ctx, 9 * (1 - u) + 2, LIME, (1 - u) * fade);
      }
      for (let k = 0; k < LOCK_BAND_COLORS.length; k++) {
        const a = -Math.PI / 2 + (k - 2) * .62;
        popTag(ctx, k, LOCK_BAND_COLORS[k], 0, 0, 46, (el - .05) / .9, Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.2, (k - 2) * .3);
      }
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}

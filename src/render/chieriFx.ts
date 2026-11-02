import type { Effect } from '../game/game.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CHIERI_BUN, CHERRY_MAX, LEAGUE_GOAL, LEAGUE_START } from './clips.ts';
import { TAU, burst, dot, glow, hash, petal, sparkle, stampText, streak } from './fxParticles.ts';

/* 梅里千樱梨 — 出风头. Her colour is BanG Dream hot pink (#FF55AA) with stage gold for the moments she is the
   centre of the room (the cymbal, 第一个！, the league board) and cherry red for the tantrum. The shapes are
   big, flat and loud — a stage poster, not filigree: fat outlined glyphs, a follow spot, one cymbal, one
   cherry pair, one board. Every effect is a single subject that reads from across the screen and decays
   fast; the long-lived ones (the spot, the crowd, the board) stay soft so they never tire the eye.
   Pure drawing: positions and timing come from the effect; noise is the shared hash table. */

/** Painted under every body: the follow spot falls behind her. */
export const CHIERI_BACK: readonly string[] = ['chieri-spot'];
/** Screen space, over everything: the penlight crowd along the bottom. (The 部下 board rides over her head.) */
export const CHIERI_SCREEN_FRONT: readonly string[] = ['league-crowd'];

const PINK = '#FF55AA';
const GOLD = '#ffd34d';
const CHERRY = '#e8193c';
const INK = '#2a0f22';
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
/** A pop: overshoots to ~1.18 and settles at 1. */
const pop = (k: number) => { const c = 2.4; const u = clamp(k, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

/** Gradients are built once per context at the origin or unit size and placed with the transform. */
const paints = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
function paint(ctx: CanvasRenderingContext2D, key: string, make: () => CanvasGradient): CanvasGradient {
  let m = paints.get(ctx);
  if (!m) paints.set(ctx, m = new Map());
  let g = m.get(key);
  if (!g) m.set(key, g = make());
  return g;
}

/** Poster type: a thick dark outline under a bright fill. */
function loud(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, line = INK): void {
  // Cached: every word here repeats for many frames (the board for three seconds).
  if (stampText(ctx, text, x, y, size, fill, line) !== -1) return;
  ctx.font = `900 ${Math.round(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * .2);
  ctx.strokeStyle = line;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * .45 : r;
    if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  if (!(size > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + size * .9);
  ctx.bezierCurveTo(x - size * 1.4, y - size * .1, x - size * .6, y - size * 1.2, x, y - size * .35);
  ctx.bezierCurveTo(x + size * .6, y - size * 1.2, x + size * 1.4, y - size * .1, x, y + size * .9);
  ctx.fill();
}
function note(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, s * .55, s * .4, -.4, 0, TAU); ctx.fill();
  ctx.fillRect(x + s * .42, y - s * 1.5, Math.max(1.5, s * .16), s * 1.5);
}
/** The cymbal seen almost edge-on: a gold lens with a bell and a highlight, tilted by `tilt`. */
function cymbal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tilt: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, 0, r + 3, r * .22 + 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * .22, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff3b8';
  ctx.beginPath(); ctx.ellipse(-r * .3, -r * .05, r * .35, r * .06, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c99a1f';
  ctx.beginPath(); ctx.ellipse(0, -r * .1, r * .2, r * .12, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
/** One cherry: a glossy red ball with a dark rim and a highlight. */
function cherry(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(x, y, r + 2, 0, TAU); ctx.fill();
  ctx.fillStyle = paint(ctx, 'cherry', () => {
    const g = ctx.createRadialGradient(-.35, -.4, .05, 0, 0, 1);
    g.addColorStop(0, '#ff8a9b'); g.addColorStop(.35, CHERRY); g.addColorStop(1, '#8e0820');
    return g;
  });
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(x - r * .38, y - r * .42, r * .22, r * .14, -.6, 0, TAU); ctx.fill();
}

/** 追光: the cone painted once, in beam space — the top of the texture is the lamp end, the bottom runs
 *  past the floor. Many thin overlapping cones, each narrower and a little brighter, so the flanks fall off
 *  with no edge; a length fade so it comes out of the dark. Two variants: full and lite (fewer layers). */
const BEAM_HALF = 80;
const BEAM_H = 256;
const beams = new Map<boolean, HTMLCanvasElement | null>();
function spotBeam(lite: boolean): HTMLCanvasElement | null {
  let c = beams.get(lite);
  if (c !== undefined) return c;
  c = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = BEAM_HALF * 2; cv.height = BEAM_H;
    const g = cv.getContext('2d');
    if (g) {
      const fall = g.createLinearGradient(0, 0, 0, BEAM_H);
      fall.addColorStop(0, 'rgba(255,226,242,0)'); fall.addColorStop(.32, 'rgba(255,226,242,0)'); fall.addColorStop(.62, 'rgba(255,230,244,.7)');
      fall.addColorStop(.92, 'rgba(255,236,247,1)'); fall.addColorStop(1, 'rgba(255,236,247,.8)');
      g.fillStyle = fall;
      g.globalCompositeOperation = 'lighter';
      const layers = lite ? 6 : 14;
      for (let i = 0; i < layers; i++) {
        const k = i / (layers - 1);
        const half = BEAM_HALF - 62 * k, neck = 6 - 3 * k;
        g.globalAlpha = (.018 + .012 * k) * (14 / layers);
        g.beginPath(); g.moveTo(BEAM_HALF - neck, 0); g.lineTo(BEAM_HALF + neck, 0); g.lineTo(BEAM_HALF + half, BEAM_H); g.lineTo(BEAM_HALF - half, BEAM_H); g.closePath(); g.fill();
      }
      c = cv;
    }
  }
  beams.set(lite, c);
  return c;
}

/** The board's number after `n` beats: the league's 3, a run-up, then a hundred million on the cymbal.
 *  Laid out once. The board asks for the same seven strings for a few seconds; toLocaleString every frame
 *  just to hit the text-stamp cache was the whole cost. */
const LEAGUE_STEPS = [LEAGUE_START, 12, 480, 9600, 240000, 6000000, LEAGUE_GOAL] as const;
const LEAGUE_TEXT = LEAGUE_STEPS.map(v => Math.round(v).toLocaleString('en-US'));
/** x0, y0, x1, y1, colour — one row of penlights, filled and stroked before the function returns.
 *  ponytail: one crowd in flight. A second league-crowd drawn reentrantly would overwrite it. */
const CROWD = new Float32Array(18 * 5);

export function drawChieriFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): boolean {
  const t = e.max - e.life;
  const p = 1 - e.life / e.max;
  const dir = e.dir ?? 1;
  switch (e.type) {
    /* ---- J 千·樱·梨！ ---- */
    case 'chieri-syllable': {
      // One fat syllable pops over the hit and floats up; 梨 closes the name with a ring of little stars.
      const i = e.n ?? 0;
      const ch = '千樱梨'[i] ?? '千';
      const k = pop(t / .16);
      ctx.save();
      ctx.globalAlpha = 1 - span(t, .45, e.max);
      ctx.translate(e.x + dir * (i - 1) * 6, e.y - ease(t / e.max) * 26);
      ctx.rotate(dir * (i - 1) * .12);
      ctx.scale(k, k);
      loud(ctx, ch, 0, 0, 40 + i * 4, i === 2 ? '#ffffff' : PINK, i === 2 ? PINK : INK);
      if (i === 2) {
        ctx.fillStyle = GOLD;
        for (let j = 0; j < 6; j++) {
          const a = j * TAU / 6 + .3;
          const d = 30 + 22 * ease(t / .3);
          star(ctx, Math.cos(a) * d, Math.sin(a) * d * .8, 6 * (1 - span(t, .2, .55)), a);
        }
      }
      ctx.restore();
      return true;
    }
    case 'chieri-first': {
      // 第一个！: a gold rosette with a ribbon, like a first-prize badge pinned over her head.
      const k = pop(t / .2);
      ctx.save();
      ctx.globalAlpha = 1 - span(t, .8, e.max);
      ctx.translate(e.x, e.y - ease(t / .3) * 10);
      ctx.scale(k, k);
      ctx.fillStyle = PINK;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(s * 10, 4); ctx.lineTo(s * 26, 34); ctx.lineTo(s * 14, 30); ctx.lineTo(s * 8, 40); ctx.lineTo(s * -2, 6); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.fill();
      ctx.fillStyle = GOLD;
      star(ctx, 0, 0, 23, t * .8);
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      loud(ctx, '1', 0, 1, 18, PINK, '#ffffff');
      loud(ctx, '第一个！', 0, -40, 20, GOLD);
      ctx.restore();
      return true;
    }
    /* ---- K 惊叹号 ---- */
    case 'chieri-bang': {
      // A giant「！！」slams in at the hit, and two flat sound arcs roll on ahead of it.
      const k = pop(t / .12);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - span(t, .25, e.max);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const lt = t - i * .06;
        if (lt < 0) continue;
        const r = 26 + 90 * ease(lt / .35);
        ctx.strokeStyle = i ? 'rgba(255,85,170,.75)' : 'rgba(255,255,255,.9)';
        ctx.lineWidth = 6 - i * 2;
        ctx.beginPath(); ctx.ellipse(dir * r * .5, 0, r * .45, r, 0, dir > 0 ? -1 : Math.PI - 1, dir > 0 ? 1 : Math.PI + 1); ctx.stroke();
      }
      ctx.save();
      ctx.rotate(dir * -.12);
      ctx.scale(k, k);
      loud(ctx, '!!', 0, -6, 56, PINK);
      ctx.restore();
      ctx.restore();
      return true;
    }
    /* ---- U 千樱梨登场 ---- */
    case 'entrance-dust': {
      // Take-off: a ring of pink star-dust kicked up at her heels.
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = PINK;
      burst(t, 11, { n: lite ? 5 : 9, speed: [80, 190], life: e.max, angle: -Math.PI / 2, spread: Math.PI * .9, gravity: 260, drag: .2 }, (x, y, k, i) => {
        star(ctx, x, y, (4 + hash(i, 3) * 4) * (1 - k), i);
      }, e.x, e.y - 4);
      ctx.restore();
      return true;
    }
    case 'entrance-quake': {
      // The landing: a shock ring laid flat on the floor — the far half thin and dim, the near half thick and
      // bright, so it reads as a disc in depth — and dust thrown out to both sides.
      const r = e.radius ?? 110;
      ctx.save();
      ctx.translate(e.x, e.y);
      const k = ease(t / .3);
      const fade = 1 - span(t, .15, e.max);
      const rx = r * (.4 + .8 * k), ry = 16 * (.5 + k);
      ctx.lineCap = 'round';
      ctx.globalAlpha = fade * .45;
      ctx.strokeStyle = '#ffd6ea';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI, TAU); ctx.stroke();
      ctx.globalAlpha = fade * .9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * (1 - k) + 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 2, rx * .7, ry * .7, 0, 0, Math.PI); ctx.stroke();
      ctx.globalAlpha = 1 - p;
      for (const s of [-1, 1]) {
        burst(t, s > 0 ? 21 : 23, { n: lite ? 3 : 5, speed: [120, 260], life: e.max, angle: s > 0 ? -.35 : Math.PI + .35, spread: .7, gravity: 500, drag: .3 }, (x, y, kk, i) => {
          glow(ctx, x, y, (10 + hash(i, 5) * 8) * (1 - kk * .4), '214,200,226');
        });
      }
      ctx.restore();
      return true;
    }
    case 'entrance-cymbal': {
      // 锵——！！: a cymbal over her head is struck — it shivers, three gold arcs ring off it, the word lands.
      const shiver = Math.sin(t * 70) * .12 * (1 - span(t, 0, .45));
      ctx.save();
      ctx.globalAlpha = 1 - span(t, .5, e.max);
      cymbal(ctx, e.x, e.y, 34, shiver);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const lt = t - i * .07;
        if (lt < 0) continue;
        const r = 40 + 70 * ease(lt / .4);
        ctx.globalAlpha = (1 - span(lt, .1, .45)) * .9;
        ctx.strokeStyle = i % 2 ? '#fff3b8' : GOLD;
        ctx.lineWidth = 4 - i;
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.arc(e.x, e.y, r, s > 0 ? -.55 : Math.PI - .55, s > 0 ? .55 : Math.PI + .55); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1 - span(t, .55, e.max);
      const k = pop(t / .14);
      ctx.save(); ctx.translate(e.x, e.y - 40); ctx.scale(k, k); ctx.rotate(-.06 * dir);
      loud(ctx, '锵——!!', 0, 0, 30, GOLD);
      ctx.restore();
      ctx.restore();
      return true;
    }
    case 'chieri-spot': {
      // 舞台灯光千樱梨要一个人独占: a follow spot from somewhere above the top of the screen swings after her.
      // Nothing in it may read as a drawn shape: there is no lamp and no outline — the beam is several
      // overlapping cones, each narrower and a little brighter, so its sides fall off softly instead of ending
      // on an edge, and every layer fades out toward the top so the beam simply comes out of the dark. The
      // pool on the floor is two soft ovals with no rim. Held for seconds, so it stays dim.
      const on = Math.min(1, t / .15) * Math.min(1, e.life / .35);
      const lx = W / 2 + (e.x - W / 2) * .3, ly = -140;
      const fx = e.x, fy = FLOOR + 4;
      const ang = Math.atan2(fy - ly, fx - lx);
      const len = Math.hypot(fx - lx, fy - ly);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // The beam stops on the floor (the pool takes over there), so its far end never shows as a cut line.
      ctx.beginPath(); ctx.rect(0, -10, W, FLOOR + 10); ctx.clip();
      ctx.translate(lx, ly);
      ctx.rotate(ang - Math.PI / 2);
      // Run the beam past the floor so the floor clip, not the slanted end of the cone, is where it stops.
      // The cone is the same shape every frame, only stretched to the distance, so it is painted once into a
      // texture (spotBeam) and drawn with one stretched drawImage instead of a dozen gradient fills.
      const beam = spotBeam(lite);
      if (beam) {
        ctx.globalAlpha = on;
        ctx.drawImage(beam, -BEAM_HALF, 0, BEAM_HALF * 2, len * 1.18);
      }
      ctx.restore();
      // The pool: a wide faint oval and a tighter brighter one, no edges.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(fx, FLOOR);
      ctx.fillStyle = paint(ctx, 'spot-pool', () => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, 'rgba(255,240,248,.95)'); g.addColorStop(.55, 'rgba(255,205,232,.4)'); g.addColorStop(1, 'rgba(255,170,215,0)');
        return g;
      });
      ctx.globalAlpha = on * .26;
      ctx.save(); ctx.scale(110, 24); ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
      ctx.globalAlpha = on * .22;
      ctx.save(); ctx.scale(62, 12); ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
      ctx.restore();
      // Motes drifting in the lower half of the beam, where it is lit.
      // Across the beam is the same perpendicular for every mote: cos(ang−π/2) = sin(ang).
      if (!lite) {
        ctx.save();
        ctx.fillStyle = '#fff6fb';
        const px = Math.sin(ang), py = -Math.cos(ang);
        for (let i = 0; i < 7; i++) {
          const u = .45 + ((hash(i, 2) + t * (.08 + hash(i, 3) * .06)) % 1) * .55;
          const side = Math.sin(t * 1.3 + i * 2.1) * 70 * u * .6;
          ctx.globalAlpha = on * .4 * Math.sin((u - .45) / .55 * Math.PI);
          dot(ctx, lx + (fx - lx) * u + px * side, ly + (fy - ly) * u + py * side, 1.3 + hash(i, 4) * 1);
        }
        ctx.restore();
      }
      return true;
    }
    case 'cheer-steal': {
      // 独占欢呼: notes and little stars lift off them and arc into her light, flashing as it takes them.
      const n = e.n ?? 2;
      const tx = e.tx ?? 0, ty = e.ty ?? 0;
      ctx.save();
      for (let i = 0; i < n; i++) {
        const lt = t - i * .05;
        if (lt < 0) continue;
        const k = ease(lt / (e.max - .1));
        const lift = -70 - hash(i, 7) * 50;
        const x = e.x + tx * k + (hash(i, 8) - .5) * 30 * (1 - k);
        const y = e.y + ty * k + lift * 4 * k * (1 - k);
        ctx.globalAlpha = Math.min(1, lt / .06) * (1 - span(k, .85, 1));
        ctx.fillStyle = i % 2 ? GOLD : PINK;
        if (i % 2) star(ctx, x, y, 6, lt * 6); else note(ctx, x, y, 8);
        if (k > .9) {
          ctx.globalAlpha = (1 - k) * 8 * .7;
          glow(ctx, e.x + tx, e.y + ty, 18, '255,220,240');
        }
      }
      ctx.restore();
      return true;
    }
    /* ---- I 千樱梨收编令 ---- */
    case 'recruit-shake': {
      // The handshake, at its most 粉萌: a big glossy heart pops out of the two hands with a soft pink glow, a
      // white sparkle ring, and a fountain of little hearts, stars and ribbon confetti tumbling out round it.
      ctx.save();
      ctx.translate(e.x, e.y);
      const hit = !!e.hit;
      const k = pop(t / .14);
      const fade = 1 - span(t, .25, e.max);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (hit ? .7 : .35);
      glow(ctx, 0, 0, 70 * k, '255,120,190');
      ctx.globalCompositeOperation = 'source-over';
      // Sparkle ring.
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 10; i++) {
        const a = i * TAU / 10 + t * 2;
        const d = 26 + 46 * ease(t / .3);
        sparkle(ctx, Math.cos(a) * d, Math.sin(a) * d * .85, (i % 2 ? 4 : 7) * (1 - span(t, .15, .45)));
      }
      // The heart.
      const hr = (hit ? 22 : 13) * k;
      ctx.fillStyle = '#ffffff';
      heart(ctx, 0, 0, hr + 4);
      ctx.fillStyle = PINK;
      heart(ctx, 0, 0, hr);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.ellipse(-hr * .38, -hr * .35, hr * .22, hr * .13, -.6, 0, TAU); ctx.fill();
      if (hit) {
        // A fountain of small hearts, stars and confetti.
        burst(t, 51, { n: lite ? 8 : 16, speed: [140, 300], life: e.max, angle: -Math.PI / 2, spread: Math.PI * 1.6, gravity: 420, drag: .35 }, (x, y, kk, i) => {
          ctx.globalAlpha = 1 - kk;
          const c = i % 3;
          ctx.fillStyle = c === 0 ? PINK : c === 1 ? '#ffc2e0' : GOLD;
          const sz = (5 + hash(i, 9) * 4) * (1 - kk * .4);
          if (c === 2) star(ctx, x, y, sz, kk * 6 + i);
          else if (i % 4 === 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(kk * 8 + i); ctx.fillRect(-sz * .9, -sz * .3, sz * 1.8, sz * .6); ctx.restore(); }
          else heart(ctx, x, y, sz);
        });
      }
      ctx.restore();
      return true;
    }
    case 'recruit-join': {
      // 入盟！ in a bubbly white-on-pink sticker, a ribbon tag with their number swinging under it, and little
      // hearts floating up off both sides.
      const k = pop(t / .16);
      ctx.save();
      ctx.globalAlpha = 1 - span(t, .6, e.max);
      ctx.translate(e.x, e.y - ease(t / e.max) * 14);
      ctx.scale(k, k);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.roundRect(-46, -19, 92, 38, 19); ctx.fill();
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.roundRect(-43, -16, 86, 32, 16); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.roundRect(-38, -13, 76, 10, 5); ctx.fill();
      loud(ctx, '入盟！', 0, 1, 22, '#ffffff', '#c2186b');
      ctx.save();
      ctx.translate(0, 18);
      ctx.rotate(Math.sin(t * 9) * .18 * (1 - span(t, 0, .6)));
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.moveTo(-22, 4); ctx.lineTo(22, 4); ctx.lineTo(22, 22); ctx.lineTo(0, 28); ctx.lineTo(-22, 22); ctx.closePath(); ctx.fill();
      loud(ctx, 'No.' + (e.n ?? 4), 0, 15, 12, '#ffffff', '#a8571a');
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const lt = t - i * .07;
        if (lt < 0) continue;
        const s = i % 2 ? 1 : -1;
        ctx.globalAlpha = (1 - span(lt, .2, .7)) * .95;
        ctx.fillStyle = i % 3 ? PINK : '#ffd0e8';
        heart(ctx, s * (54 + i * 4) + Math.sin(lt * 8 + i) * 4, -lt * 70, 6 + (i % 3));
      }
      ctx.restore();
      return true;
    }
    /* ---- O 千樱梨樱桃炸弹 ---- */
    case 'cherry-fuse': {
      // The buns become the cherries: two glossy cherries on one stem over her head, the stem a fuse whose spark
      // burns down toward them; they throb like a heartbeat, a size up for every stack.
      const n = e.n ?? 0;
      const fuse = e.heavy ? 1 : clamp(t / Math.max(.05, e.max - .04), 0, 1);
      const beat = Math.max(0, Math.sin(t * 15)) ** 3;
      const r = (8 + n * 2.5) * (1 + beat * .12) * pop(t / .12);
      // Held past the fuse (combat.ts marks the effect heavy): the cherries tremble, ready to go.
      const held = !!e.heavy;
      const bx = e.x + dir * CHIERI_BUN.x + (held ? Math.sin(t * 90) * 2 : 0), by = e.y - CHIERI_BUN.y + (held ? Math.cos(t * 77) * 1.5 : 0);
      const g = CHIERI_BUN.gap + n * 1.5;
      const top = { x: bx + dir * 3, y: by - 34 - n * 2 };
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.life / .04);
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(bx + s * g, by - r * .6);
        ctx.quadraticCurveTo(bx + s * g * .4, top.y + 8, top.x, top.y);
        ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = '#4f8a2b'; ctx.lineWidth = 2.6; ctx.stroke();
      }
      // The burnt part of the fuse goes dark from the tip down.
      ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(top.x, top.y - 16 * (1 - fuse)); ctx.stroke();
      const sx = top.x, sy = top.y - 16 * (1 - fuse);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .8 + .2 * Math.sin(t * 40);
      glow(ctx, sx, sy, 12 + n * 2, '255,200,90');
      ctx.strokeStyle = '#fff1b0';
      for (let i = 0; i < (lite ? 3 : 6); i++) {
        const a = hash(i, Math.floor(t * 30)) * TAU;
        const d = 4 + hash(i, 9) * 8;
        streak(ctx, sx, sy, sx + Math.cos(a) * d, sy + Math.sin(a) * d, 1.4);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      for (const s of [-1, 1]) cherry(ctx, bx + s * g, by, r);
      ctx.restore();
      return true;
    }
    case 'cherry-eager': {
      // 长按: ripe and holding on — rings of red light keep closing in on her as if the blast is being sucked
      // back in, the whole thing jittering, sparks pulled inward, and the ring tightening faster the more stacks.
      const n = e.n ?? 0;
      const cx = e.x + Math.sin(t * 83) * 2.5, cy = e.y - 92 + Math.cos(t * 71) * 2;
      const rate = 2.2 + n * .5;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t / .1) * Math.min(1, e.life / .05);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= .35 + .15 * Math.sin(t * 30);
      glow(ctx, cx, cy, 70 + n * 8, '255,60,90');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, t / .1) * Math.min(1, e.life / .05);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const u = (t * rate + i / 3) % 1;
        const r = 120 + n * 18 - u * (100 + n * 14);
        ctx.strokeStyle = i % 2 ? '#ff8aa0' : CHERRY;
        ctx.lineWidth = 2 + u * 4;
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * Math.sin(u * Math.PI) * .9;
        ctx.beginPath();
        // A slightly wobbly ring, so it reads as straining rather than a clean circle.
        for (let j = 0; j <= 24; j++) {
          const a = j * TAU / 24;
          const rr = r + Math.sin(a * 5 + t * 40) * 3;
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * .9;
          if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = a0;
      }
      ctx.strokeStyle = '#ffe1a6';
      for (let i = 0; i < (lite ? 6 : 12); i++) {
        const u = (t * (1.6 + hash(i, 3)) + hash(i, 4)) % 1;
        const a = hash(i, 5) * TAU;
        const d0 = 110 * (1 - u) + 14, d1 = d0 + 12;
        ctx.globalAlpha = Math.sin(u * Math.PI) * .9;
        streak(ctx, cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, cx + Math.cos(a) * d0, cy + Math.sin(a) * d0, 1.8);
      }
      // Two little anger marks flicker over her head.
      ctx.globalAlpha = .6 + .4 * Math.sin(t * 24);
      loud(ctx, '!!', e.x + (e.dir ?? 1) * 26 + Math.sin(t * 60) * 2, e.y - 205, 20, '#ffffff', CHERRY);
      ctx.restore();
      return true;
    }
    case 'cherry-swell': {
      // A stack: one throb ring off the cherries and a small「+」.
      const bx = e.x + dir * CHIERI_BUN.x, by = e.y - CHIERI_BUN.y;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = '#ff6f86';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(bx, by, 14 + 26 * ease(p), 0, TAU); ctx.stroke();
      loud(ctx, '+' + (e.n ?? 1), bx + dir * 30, by - 22 - p * 14, 16, '#ffffff', CHERRY);
      ctx.restore();
      return true;
    }
    case 'cherry-boom': {
      // The blast round her: a white shock ring the size of the hit, a cherry-red fireball, juice drops flung
      // out, the two pits spinning away, and a few pink petals settling after.
      const R = e.radius ?? 130;
      const n = e.n ?? 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      // Fireball: grows fast, then thins.
      const kb = ease(t / .22);
      ctx.globalAlpha = (1 - span(t, .12, .55)) * .95;
      ctx.fillStyle = paint(ctx, 'boom', () => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, '#fff4f0'); g.addColorStop(.3, '#ff7f93'); g.addColorStop(.7, 'rgba(232,25,60,.75)'); g.addColorStop(1, 'rgba(232,25,60,0)');
        return g;
      });
      ctx.save(); ctx.scale(R * kb, R * kb * .9); ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
      // Shock ring at the radius that actually hits.
      ctx.globalAlpha = 1 - span(t, .1, .4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8 * (1 - span(t, 0, .35)) + 1;
      ctx.beginPath(); ctx.arc(0, 0, R * ease(t / .18), 0, TAU); ctx.stroke();
      // Juice drops.
      ctx.fillStyle = CHERRY;
      ctx.globalAlpha = 1 - span(t, .4, e.max);
      burst(t, 31, { n: lite ? 8 : 14 + n * 3, speed: [R * 1.4, R * 3], life: .75, gravity: 900, drag: .25 }, (x, y, k, i) => {
        dot(ctx, x, y, (3 + hash(i, 4) * 4) * (1 - k * .5));
      });
      // The two pits.
      ctx.fillStyle = '#f3dcc0';
      for (const s of [-1, 1]) {
        const k = t / .8;
        const x = s * R * .9 * ease(k), y = -R * .7 * Math.sin(Math.min(1, k) * Math.PI) + 60 * k * k;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 12 * s);
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 7, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      // Petals after the bang.
      if (!lite && t > .2) {
        const lt = t - .2;
        for (let i = 0; i < 5 + n; i++) {
          const x = (hash(i, 12) - .5) * R * 1.6 + Math.sin(lt * 3 + i) * 10;
          const y = -R * .6 + (hash(i, 13) * R * .4) + lt * 70;
          ctx.globalAlpha = (1 - span(lt, .35, e.max - .2)) * .9;
          petal(ctx, x, y, 7, lt * 4 + i, i % 2 ? '#ffc2dc' : '#ff8fbf');
        }
      }
      ctx.restore();
      return true;
    }
    case 'cherry-shout': {
      // 千樱梨绝不答应！！ — bigger the more she was provoked.
      const n = e.n ?? 0;
      const k = pop(t / .14);
      ctx.save();
      ctx.globalAlpha = 1 - span(t, .6, e.max);
      ctx.translate(e.x, e.y - ease(t / e.max) * 10);
      ctx.scale(k, k);
      ctx.rotate(Math.sin(t * 50) * .03 * (1 - span(t, 0, .3)));
      loud(ctx, '千樱梨绝不答应！！', 0, 0, 22 + n * 3, '#ffffff', CHERRY);
      ctx.restore();
      return true;
    }
    case 'cherry-smoke': {
      // Out of breath: a little grey puff off the top of her head.
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const lt = t - i * .12;
        if (lt < 0) continue;
        ctx.globalAlpha = (1 - span(lt, 0, .6)) * .6;
        glow(ctx, e.x + (i - 1) * 8, e.y - lt * 60, 10 + lt * 18, '200,192,210');
      }
      ctx.restore();
      return true;
    }
    /* ---- L 千樱梨联盟集合 ---- */
    case 'assemble-call': {
      // The call: hands round her mouth and fat pink sound rings that run off across the whole screen.
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const lt = t - i * .1;
        if (lt < 0) continue;
        const k = ease(lt / .55);
        const r = 20 + 900 * k;
        ctx.globalAlpha = (1 - k) * .85;
        ctx.strokeStyle = i % 2 ? '#ffffff' : PINK;
        ctx.lineWidth = 7 * (1 - k) + 1.5;
        ctx.beginPath(); ctx.ellipse(dir * r * .5, 0, r * .55, Math.min(260, 30 + r * .35), 0, dir > 0 ? -1.1 : Math.PI - 1.1, dir > 0 ? 1.1 : Math.PI + 1.1); ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'assemble-rope': {
      // The haul: a pink ribbon from her hand to them that snaps tight and reels them in.
      const k = ease(p);
      const tx = (e.tx ?? 0) * (1 - k), ty = (e.ty ?? 0) * (1 - k);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 1 - span(p, .8, 1);
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(tx * .5, ty * .5 - 30 * (1 - k), tx, ty); ctx.stroke();
      ctx.strokeStyle = PINK; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(tx * .5, ty * .5 - 30 * (1 - k), tx, ty); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      star(ctx, tx, ty, 12, t * 8);
      ctx.restore();
      return true;
    }
    case 'chieri-drumhead': {
      // Each beat drops a little pink tom on them, seen a touch from above: a glossy pink shell with a white
      // racing stripe, chrome hoops and lugs, and a white head that squashes on the hit and ripples out twice.
      // Out of it bursts a spray of pink stars, hearts and sparkles, and 咚！ bounces off the rim.
      const i = e.n ?? 0;
      ctx.save();
      ctx.translate(e.x + dir * (i % 2 ? 10 : -10), e.y + (i % 2 ? -6 : 4));
      ctx.rotate(dir * (i % 2 ? .1 : -.08));
      const k = pop(t / .1);
      const squash = 1 - .18 * Math.max(0, 1 - t / .08);
      const fade = 1 - span(t, .2, e.max);
      const r = (38 + i * 2) * k, hh = r * .34 * squash, sh = r * .85;
      ctx.globalAlpha = fade;
      // Shell.
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.ellipse(0, sh, r + 3, hh + 3, 0, 0, Math.PI); ctx.lineTo(-r - 3, 0); ctx.ellipse(0, 0, r + 3, hh + 3, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.fillStyle = paint(ctx, 'tom-shell', () => {
        const g = ctx.createLinearGradient(-1, 0, 1, 0);
        g.addColorStop(0, '#b0175f'); g.addColorStop(.35, '#ff7cc0'); g.addColorStop(.55, '#ffa8d6'); g.addColorStop(1, '#a3145a');
        return g;
      });
      ctx.save(); ctx.scale(r, 1);
      ctx.beginPath(); ctx.ellipse(0, sh, 1, hh, 0, 0, Math.PI); ctx.lineTo(-1, 0); ctx.lineTo(1, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(-r, sh * .45, r * 2, 4);
      // Lugs on the shell.
      ctx.fillStyle = '#e8e6f2';
      for (let j = 0; j < 5; j++) {
        const u = -.8 + j * .4;
        ctx.fillRect(u * r - 2, sh * .15, 4, sh * .55);
      }
      // Bottom hoop.
      ctx.strokeStyle = '#d9d6e6';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, sh, r, hh, 0, 0, Math.PI); ctx.stroke();
      // Head.
      ctx.fillStyle = paint(ctx, 'tom-head', () => {
        const g = ctx.createRadialGradient(-.3, -.3, .05, 0, 0, 1);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#efe6f4');
        return g;
      });
      ctx.save(); ctx.scale(r, hh); ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#d9d6e6';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, r, hh, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = PINK;
      star(ctx, 0, 0, hh * .6, 0);
      // The head ripples.
      ctx.strokeStyle = '#ffffff';
      for (let j = 0; j < 2; j++) {
        const lt = t - j * .07;
        if (lt < 0) continue;
        const q = ease(lt / .32);
        ctx.globalAlpha = (1 - q) * fade;
        ctx.lineWidth = 3 - j;
        ctx.beginPath(); ctx.ellipse(0, 0, r + 8 + 46 * q, hh + 3 + 16 * q, 0, 0, TAU); ctx.stroke();
      }
      // The cute burst.
      ctx.globalAlpha = 1;
      burst(t, 61 + i, { n: lite ? 7 : 13, speed: [160, 330], life: e.max, angle: -Math.PI / 2, spread: Math.PI * 1.5, gravity: 520, drag: .3 }, (x, y, kk, j) => {
        ctx.globalAlpha = (1 - kk) * fade;
        const c = j % 4;
        const sz = (5 + hash(j, 7) * 5) * (1 - kk * .5);
        if (c === 0 || c === 2) { ctx.fillStyle = c ? '#ffd0e8' : PINK; star(ctx, x, y - hh, sz, kk * 7 + j); }
        else if (c === 1) { ctx.fillStyle = PINK; heart(ctx, x, y - hh, sz * .9); }
        else { ctx.fillStyle = '#ffffff'; sparkle(ctx, x, y - hh, sz); }
      });
      ctx.globalAlpha = 1 - span(t, .2, e.max);
      ctx.save();
      ctx.translate(dir * (r + 20), -hh - 14 - t * 34);
      ctx.scale(pop(t / .12), pop(t / .12));
      loud(ctx, '咚！', 0, 0, 20 + i * 1.5, '#ffffff', PINK);
      ctx.restore();
      ctx.restore();
      return true;
    }
    case 'assemble-cymbal': {
      // The last hit: a big cymbal crash — the cymbal, gold rays, and 锵——！！ across them.
      ctx.save();
      ctx.globalAlpha = 1 - span(t, .5, e.max);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = GOLD;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12 + .13;
        const r0 = 40 + 30 * ease(t / .2), r1 = r0 + 70 * (1 - span(t, .1, .5));
        ctx.lineWidth = i % 2 ? 3 : 5;
        streak(ctx, e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1, ctx.lineWidth);
      }
      ctx.globalCompositeOperation = 'source-over';
      cymbal(ctx, e.x, e.y - 10, 58 * pop(t / .12), Math.sin(t * 60) * .15 * (1 - span(t, 0, .5)));
      const k = pop(t / .14);
      ctx.save(); ctx.translate(e.x, e.y - 70); ctx.scale(k, k);
      loud(ctx, '锵——!!', 0, 0, 40, GOLD);
      ctx.restore();
      ctx.restore();
      return true;
    }
    case 'league-crowd': {
      // The league turns out: a row of dark heads along the bottom of the screen with pink penlights swaying
      // over them. A call nobody answered (n −1): they tip over backwards, flat — cardboard cut-outs.
      // The crowd stays up for the whole super, so the answered call is one fill and two strokes. The miss
      // still turns each cut-out on its own pivot.
      const whiff = (e.n ?? 0) < 0;
      const rise = ease(t / .4);
      const out = Math.min(1, e.life / .4);
      const count = lite ? 12 : 18;
      ctx.save();
      if (whiff) {
        for (let i = 0; i < count; i++) {
          const x = (i + .5) * W / count + (hash(i, 1) - .5) * 20;
          const base = H + 8 - (36 + hash(i, 2) * 18) * rise * out;
          const fallT = span(t, .55 + hash(i, 3) * .3, .85 + hash(i, 3) * .3);
          ctx.save();
          ctx.translate(x, H + 8);
          ctx.rotate(fallT * (hash(i, 4) > .5 ? 1.3 : -1.3));
          ctx.translate(0, base - H - 8);
          ctx.fillStyle = '#a8865a';
          ctx.globalAlpha = .92;
          ctx.beginPath(); ctx.arc(0, -26, 12, 0, TAU); ctx.fill();
          ctx.fillRect(-18, -14, 36, 40);
          ctx.fillStyle = '#7a5c39';
          ctx.fillRect(-2, 26, 4, 10);
          ctx.restore();
        }
        ctx.restore();
        return true;
      }
      ctx.fillStyle = '#1b1424';
      ctx.globalAlpha = .92;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = (i + .5) * W / count + (hash(i, 1) - .5) * 20;
        const base = H + 8 - (36 + hash(i, 2) * 18) * rise * out;
        const sway = Math.sin(t * 7 + i * 1.7) * .5;
        const hx = x + 12, hy = base - 18;
        const o = i * 5;
        CROWD[o] = hx; CROWD[o + 1] = hy;
        CROWD[o + 2] = hx + Math.sin(sway) * 30; CROWD[o + 3] = hy - Math.cos(sway) * 30;
        CROWD[o + 4] = i % 3 ? 1 : 0;
        ctx.moveTo(x + 12, base - 26);
        ctx.arc(x, base - 26, 12, 0, TAU);
        ctx.rect(x - 18, base - 14, 36, 40);
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .55;
      for (let i = 0; i < count; i++) glow(ctx, CROWD[i * 5 + 2], CROWD[i * 5 + 3], 16, '255,85,170');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      for (let c = 0; c < 2; c++) {
        ctx.strokeStyle = c ? PINK : '#ffd0e8';
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (CROWD[i * 5 + 4] !== c) continue;
          ctx.moveTo(CROWD[i * 5], CROWD[i * 5 + 1]);
          ctx.lineTo(CROWD[i * 5 + 2], CROWD[i * 5 + 3]);
        }
        ctx.stroke();
      }
      ctx.restore();
      return true;
    }
    case 'league-count': {
      // The board: 千樱梨联盟 部下 and a number that rolls up a digit-run on every beat and lands on
      // 100,000,000 with the cymbal. A call nobody answered leaves it on 3, with a small「……」.
      const n = e.n ?? 0;
      const whiff = n < 0;
      const step = whiff ? 0 : Math.min(n, LEAGUE_STEPS.length - 1);
      const out = Math.min(1, e.life / .3);
      const value = LEAGUE_STEPS[step];
      const done = step >= LEAGUE_STEPS.length - 1;
      const w = 250, h = 60;
      ctx.save();
      ctx.globalAlpha = out;
      // Kept whole on screen even when she stands by a wall.
      ctx.translate(clamp(e.x, w / 2 + 12, W - w / 2 - 12), e.y);
      const sc = pop(t / .22);
      ctx.scale(sc, sc);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 18); ctx.fill();
      ctx.fillStyle = PINK;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.roundRect(-w / 2 + 6, -h / 2 + 24, w - 12, h - 30, 10); ctx.fill();
      if (stampText(ctx, '千樱梨联盟 · 部下', 0, -h / 2 + 12, 13, '#ffffff') === -1) {
        ctx.font = `900 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('千樱梨联盟 · 部下', 0, -h / 2 + 12);
      }
      loud(ctx, LEAGUE_TEXT[step] ?? LEAGUE_TEXT[0], 0, 9, done ? 26 : 23, done ? GOLD : PINK, INK);
      if (done && !lite) {
        ctx.fillStyle = GOLD;
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8 + t;
          star(ctx, Math.cos(a) * (w * .55), Math.sin(a) * (h * .75), 6, a);
        }
      }
      if (whiff) loud(ctx, '……', w / 2 + 26, 4, 22, '#ffffff', INK);
      ctx.restore();
      return true;
    }
  }
  return false;
}

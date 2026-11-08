import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CHISATO_BUBBLES, CHISATO_HOPS } from './clips.ts';
import { TAU, burst, confetti, cycle, dot, glow, hash, petal, sparkle, stampText } from './fxParticles.ts';

/* 白鹭千圣 — 淡金少女漫画、蜡笔涂鸦、紫灰冷眼. Three registers, kept apart so each move reads at a glance:
   - her pale gold (#FFEEAA) as a 少女漫画 backdrop: big soft five-petal flowers and rising bubbles behind her
     (铁壁微笑, and her half of the 说教 screen); petals where a hit lands on her; a pink 青筋 per hit;
   - crayon for 画伯: 珍妮弗 is a wobbly scribble, with paw prints, a scribble bite and a paper ball;
   - cold violet for the look: a manga shadow over the top of her face, a hairline glance, a close-up strip across
     the screen, and on them a small rain cloud with a 「不可回收」 tag.
   All flat shapes; nothing here uses shadowBlur. The busiest moment (the 花丸) is about 20 particles. */

export const CHISATO_BACK: readonly string[] = ['chisato-bloom', 'chisato-gogo', 'chisato-cushion'];
export const CHISATO_SCREEN_BACK: readonly string[] = ['chisato-split'];
export const CHISATO_SCREEN_FRONT: readonly string[] = ['chisato-cutin'];
const JENNIFER = '/sprites/chisato/jennifer.png';
const GLARE_CUTIN = '/sprites/chisato/glare-cutin.png';

const GOLD = '#FFEEAA';
const GOLD_DEEP = '#f1c96a';
const BLUSH = '#ffc9d6';
const VIOLET = '#9d7fd6';
const DUSK = '#2a1f3d';
const CRAYON = '#5a3b2a';
const CRAYON_FILL = '#fff4cf';
const VEIN = '#ff6f9c';
const STAMP = '#ff5f7e';

const n = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const fadeIO = (el: number, life: number, a: number, b: number) => Math.min(1, el / a, life / b);

/* ---- little shapes ---- */

/** A soft five-petal flower, the 少女漫画 kind: pale petals, a deeper centre. */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, fill: string, core: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot + i * TAU / 5;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    ctx.moveTo(x + dx * 1.05, y + dy * 1.05);
    ctx.ellipse(x + dx * .55, y + dy * .55, r * .5, r * .34, a, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x, y, r * .26, 0, TAU); ctx.fill();
}
/** A hollow bubble with a glint, the backdrop kind. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - r * .35, y - r * .35, r * .22, 0, TAU); ctx.fill();
}
/** The manga anger mark: four little arcs bowed out round a centre. */
function vein(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const cx = x + Math.cos(a) * s * .62, cy = y + Math.sin(a) * s * .62;
    ctx.moveTo(cx + Math.cos(a + 1.3) * s * .5, cy + Math.sin(a + 1.3) * s * .5);
    ctx.quadraticCurveTo(x + Math.cos(a) * s * .1, y + Math.sin(a) * s * .1, cx + Math.cos(a - 1.3) * s * .5, cy + Math.sin(a - 1.3) * s * .5);
  }
  ctx.stroke();
}
/** A rounded rectangle path (no ctx.roundRect: older webviews lack it). */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** A crayon line: a few passes a pixel or two apart, jittered by `seed`, so it reads hand-drawn and boils. */
function crayonPath(ctx: CanvasRenderingContext2D, pts: [number, number][], seed: number, closed = false): void {
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const jx = (hash(i + pass * 31, seed) - .5) * 3, jy = (hash(i + pass * 31, seed + 7) - .5) * 3;
      if (i === 0) ctx.moveTo(pts[i][0] + jx, pts[i][1] + jy);
      else ctx.lineTo(pts[i][0] + jx, pts[i][1] + jy);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
}
function blob(cx: number, cy: number, rx: number, ry: number, seed: number, k = 12): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const a = i / k * TAU;
    const w = 1 + (hash(i, seed) - .5) * .28;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return pts;
}

/** 珍妮弗: 千圣's dog as she drew it. A lumpy body, four legs of four lengths, both eyes on one side of the head,
 *  one ear up and one flopped, a tongue out, a tail. `boil` reseeds the wobble a dozen times a second. */
function jennifer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, boil: number, wag: number, squash: number, images?: ImageCache): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * s, s * squash);
  const im = images?.get(JENNIFER);
  if (im?.naturalWidth) {
    ctx.rotate(Math.sin(wag * 9) * .04);
    ctx.drawImage(im, -48, -46, 96, 80);
    ctx.restore();
    return;
  }
  // Keep the crayon drawing while extra images stream in.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Paper edge, as if it had just been torn off the page.
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.ellipse(0, -2, 42, 30, 0, 0, TAU); ctx.fill();
  const seed = boil * 13;
  ctx.fillStyle = CRAYON_FILL;
  ctx.strokeStyle = CRAYON;
  ctx.lineWidth = 2.6;
  // Legs first, under the body.
  const legs: [number, number][] = [[-20, 22], [-9, 15], [8, 25], [19, 17]];
  for (let i = 0; i < legs.length; i++) {
    const [lx, len] = legs[i];
    const kick = Math.sin(wag * 2 + i * 1.7) * 4;
    crayonPath(ctx, [[lx, 6], [lx + kick, 6 + len]], seed + i);
  }
  const body = blob(0, 0, 27, 15, seed + 3);
  ctx.beginPath();
  body.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  crayonPath(ctx, body, seed + 4, true);
  // Head: a lopsided circle up front.
  const head = blob(28, -14, 15, 13, seed + 5, 10);
  ctx.beginPath();
  head.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  crayonPath(ctx, head, seed + 6, true);
  // Ears: one up, one flopped.
  crayonPath(ctx, [[20, -24], [17, -40], [27, -27]], seed + 8);
  crayonPath(ctx, [[32, -26], [44, -30], [40, -18]], seed + 9);
  // Both eyes on the same side, not quite level.
  ctx.fillStyle = CRAYON;
  dot(ctx, 33, -18, 2.6);
  dot(ctx, 40, -14, 2.2);
  // Tongue.
  ctx.fillStyle = '#ff7a9a';
  ctx.beginPath(); ctx.ellipse(37, -2, 3.5, 6, .3, 0, TAU); ctx.fill();
  // Tail, wagging.
  ctx.strokeStyle = CRAYON;
  const t = Math.sin(wag * 9) * .6;
  crayonPath(ctx, [[-26, -4], [-36, -12 + t * 8], [-40, -24 + t * 12]], seed + 11);
  // A pink crayon cheek, because she meant it to be cute.
  ctx.fillStyle = 'rgba(255,140,170,.55)';
  dot(ctx, 30, -8, 3);
  ctx.restore();
}
/** A crayon paw print: a pad and three toes. */
function paw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath(); ctx.ellipse(x, y, s, s * .55, 0, 0, TAU); ctx.fill();
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * s * .7, y - s * .9, s * .32, 0, TAU); ctx.fill(); }
}

/* ---- projectiles ---- */

export function drawChisatoShot(ctx: CanvasRenderingContext2D, p: Projectile, images?: ImageCache): boolean {
  if (p.fx !== 'chisato-jennifer') return false;
  const dir = Math.sign(p.vx) || 1;
  // A soft shadow on the floor, smaller at the top of a hop.
  const phase = p.age * CHISATO_HOPS % 1;
  const lift = Math.sin(phase * Math.PI);
  ctx.save();
  ctx.globalAlpha = .32 - lift * .14;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(p.x, FLOOR - 2, 25 - lift * 9, 5, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(p.x, p.y - 4);
  ctx.rotate(dir * (phase - .5) * lift * .6);
  jennifer(ctx, 0, 0, 1.12 - lift * .07, dir, Math.floor(p.age * 12), p.age, .82 + lift * .25, images);
  ctx.restore();
  return true;
}

/* ---- effects ---- */

export function drawChisatoFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('chisato-')) return false;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  const h = e.radius ?? 175;
  ctx.save();
  switch (e.type) {
    /* -- U 这明明是狗 -- */
    case 'chisato-page': {
      // The same drawing is still on the sheet as it tears free of the sketchbook.
      const k = ease(el / e.max);
      ctx.save();
      ctx.globalAlpha = Math.min(1, e.life / .18);
      ctx.translate(e.x + dir * k * 42, e.y - Math.sin(k * Math.PI) * 16 + k * 26);
      ctx.rotate(dir * (k * .9 - .2));
      ctx.scale(1 - k * .85, 1);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d8cdb2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-16, -20); ctx.lineTo(16, -20); ctx.lineTo(16, 20);
      for (let i = 0; i <= 6; i++) ctx.lineTo(16 - i * 32 / 6, 20 + (i % 2 ? -3 : 1));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      jennifer(ctx, 0, 0, .26, dir, 0, 0, 1, images);
      ctx.restore();
      burst(el, 17, { n: n(6, liteFx), speed: [65, 145], life: .4, gravity: 320, angle: -Math.PI / 2 + dir * .6, spread: 2.2 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? '#ffffff' : GOLD_DEEP;
        confetti(ctx, x, y, 3, 5, i + el * 5, i + el * 12);
      }, e.x, e.y);
      break;
    }
    case 'chisato-print': {
      ctx.globalAlpha = Math.min(1, e.life / .5) * .55;
      ctx.fillStyle = CRAYON;
      paw(ctx, e.x + dir * ((e.n ?? 0) % 2 ? 6 : -6), e.y - 4, 5);
      const k = ease(el / .16);
      ctx.globalAlpha = (1 - k) * .8;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        const x = e.x + s * (9 + k * 18);
        ctx.moveTo(x, e.y - 2); ctx.lineTo(x + s * 8, e.y - 5 - k * 6);
      }
      ctx.stroke();
      break;
    }
    case 'chisato-bite': {
      // 咔: a scribble knot where the teeth went in, flecks of crayon flying.
      const k = ease(el / .12);
      ctx.globalAlpha = Math.min(1, e.life / .2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 11; i++) {
        const a = i * 2.3, r = (14 + hash(i, 4) * 26) * k;
        const x = e.x + dir * 18 + Math.cos(a) * r, y = e.y - 10 + Math.sin(a) * r * .8;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = CRAYON;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      // Two crayon fangs where it bit.
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = CRAYON;
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        const fx = e.x + dir * 18 + s * 8, fy = e.y - 10 - 22 * k;
        ctx.beginPath(); ctx.moveTo(fx - 5, fy); ctx.lineTo(fx + 5, fy); ctx.lineTo(fx, fy + 12 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      burst(el, 41, { n: n(8, liteFx), speed: [120, 260], life: .35, gravity: 300 }, (x, y, q, i) => {
        ctx.globalAlpha = 1 - q;
        ctx.fillStyle = i % 2 ? CRAYON : '#ff7a9a';
        ctx.fillRect(x - 2, y - 1, 5, 2.5);
      }, e.x + dir * 18, e.y - 10);
      break;
    }
    case 'chisato-bye': {
      // A miss: it stops, wags at the crowd, then gets crumpled into a paper ball that drops and fades.
      const crumple = clamp((el - .45) / .2, 0, 1);
      if (crumple < 1) {
        ctx.globalAlpha = 1;
        jennifer(ctx, e.x, e.y - 30, 1.05 * (1 - crumple * .7), dir, Math.floor(el * 12), el * 3, 1 - crumple * .3, images);
      } else {
        const k = clamp((el - .65) / .25, 0, 1);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#fbf7ec';
        ctx.strokeStyle = '#c9bfa6';
        ctx.lineWidth = 1.5;
        const y = e.y - 18 + k * 12;
        ctx.beginPath(); ctx.arc(e.x, y, 11, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.x - 6, y - 4); ctx.lineTo(e.x + 2, y + 1); ctx.lineTo(e.x - 1, y + 7); ctx.stroke();
      }
      break;
    }
    case 'chisato-aya': {
      // 「这是狗啊！？」: 丸山彩 has seen it before.
      const pop = el < .12 ? .5 + ease(el / .12) * .5 : 1;
      ctx.globalAlpha = Math.min(1, e.life / .25);
      stampText(ctx, '！？', e.x, e.y, 30 * pop, '#ffffff', '#ff88bb');
      break;
    }
    /* -- I 铁壁微笑 -- */
    case 'chisato-bloom': {
      // The 少女漫画 backdrop behind her: big soft flowers turning slowly round her shoulders, bubbles rising,
      // a warm glow. Behind the body (CHISATO_BACK), so the smile itself stays clean.
      const a = fadeIO(el, e.life, .25, .3);
      const cx = e.x, cy = e.y - h * .62;
      ctx.globalAlpha = a * .35;
      glow(ctx, cx, cy, h * .55, '255,238,170');
      const m = n(6, liteFx);
      for (let i = 0; i < m; i++) {
        const ang = i / m * TAU + el * .35;
        const rr = h * (.36 + .1 * hash(i, 2));
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * .8;
        const pop = ease((el - i * .04) / .25);
        if (pop <= 0) continue;
        ctx.globalAlpha = a * .5;
        flower(ctx, x, y, (18 + hash(i, 3) * 14) * pop, el * .6 + i, i % 2 ? GOLD : BLUSH, GOLD_DEEP);
      }
      ctx.strokeStyle = 'rgba(255,248,214,.9)';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.6;
      for (let i = 0, b = n(8, liteFx); i < b; i++) {
        const k = cycle(el, .45, i, 5);
        ctx.globalAlpha = a * Math.sin(k * Math.PI) * .8;
        bubble(ctx, cx + (hash(i, 6) - .5) * h * .9 + Math.sin(el * 2 + i) * 6, cy + h * .45 - k * h * 1.05, 3 + hash(i, 7) * 6);
      }
      break;
    }
    case 'chisato-petals': {
      // A hit on her turns to petals and drifts off. She does not blink.
      burst(el, 17, { n: n(10, liteFx), speed: [90, 220], life: .7, gravity: 60, angle: dir > 0 ? Math.PI : 0, spread: 2.2, drag: .2 }, (x, y, q, i) => {
        ctx.globalAlpha = (1 - q) * .95;
        petal(ctx, x, y, 6 * (1 - q * .3), el * 6 + i, i % 3 ? BLUSH : GOLD);
      }, e.x, e.y);
      break;
    }
    case 'chisato-vein': {
      // 青筋 on the temple, one per hit, in a little arc over the head; a beat of a pulse while it holds.
      const i = e.n ?? 0;
      const pop = el < .14 ? .4 + ease(el / .14) * .6 + Math.sin(el / .14 * Math.PI) * .25 : 1;
      const beat = 1 + .08 * Math.max(0, Math.sin(el * 9));
      const spots = [[18, -6], [-14, -14], [4, -26]];
      const [ox, oy] = spots[i % 3];
      ctx.globalAlpha = Math.min(1, e.life / .15);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      vein(ctx, e.x + dir * ox, e.y + oy, 9 * pop * beat);
      ctx.strokeStyle = VEIN;
      ctx.lineWidth = 3;
      vein(ctx, e.x + dir * ox, e.y + oy, 9 * pop * beat);
      break;
    }
    case 'chisato-wilt': {
      // The third vein: the flowers go grey-violet and drop, a cold wash flickers over her.
      const k = el / e.max;
      ctx.globalAlpha = (1 - k) * .3;
      glow(ctx, e.x, e.y - h * .6, h * .6, '120,96,170');
      for (let i = 0, m = n(6, liteFx); i < m; i++) {
        const x = e.x + (hash(i, 1) - .5) * h * .9;
        const y = e.y - h * (.4 + .5 * hash(i, 2)) + ease(k) * 70;
        ctx.globalAlpha = (1 - k) * .8;
        flower(ctx, x, y, 12 * (1 - k * .4), i + k * 2, '#a99cbf', '#6f6390');
      }
      break;
    }
    /* -- O 垃圾分拣 -- */
    case 'chisato-shade': {
      // Over the top of her face: the manga shadow, violet with fine vertical lines, two cold glints for eyes.
      const a = fadeIO(el, e.life, .06, .2);
      const top = e.y - h, w = h * .2, fh = h * .13;
      const fx = e.x + dir * h * .02;
      ctx.globalAlpha = a * .55;
      ctx.fillStyle = DUSK;
      rrect(ctx, fx - w / 2, top + h * .02, w, fh, 6); ctx.fill();
      ctx.globalAlpha = a * .7;
      ctx.strokeStyle = '#6b58a0';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const x = fx - w / 2 + 3 + i * (w - 6) / 5;
        ctx.beginPath(); ctx.moveTo(x, top + h * .03); ctx.lineTo(x, top + h * .02 + fh); ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#efe6ff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const ey = top + h * .02 + fh * .62;
      for (const ex of [fx + dir * w * .08, fx + dir * w * .34]) {
        ctx.beginPath(); ctx.moveTo(ex - dir * 4, ey); ctx.lineTo(ex + dir * 5, ey - 1.5); ctx.stroke();
      }
      break;
    }
    case 'chisato-gaze': {
      // A cold ink stroke with a bright tip that runs along the line of sight.
      const k = ease(el / .07);
      const a = Math.min(1, e.life / .2);
      const x = e.x + (e.tx ?? 0) * k, y = e.y + (e.ty ?? 0) * k;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x, y);
      ctx.globalAlpha = a * .45;
      ctx.strokeStyle = VIOLET;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = a * .9;
      ctx.strokeStyle = '#efe6ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, x, y, 8 * (1 - el / e.max));
      break;
    }
    case 'chisato-cutin': {
      // The manga panel opens on the eyes, then closes as it slides away.
      const k = el / e.max;
      const enter = ease(k / .22), exit = ease((k - .76) / .24);
      const open = enter * (1 - exit);
      if (open <= 0) break;
      const sw = 512, sh = 192, sy = H * .28;
      const half = sh / 2 * open;
      const top = sy - half, bottom = sy + half;
      ctx.translate(dir * (enter - 1 + exit) * W * .56, 0);
      ctx.globalAlpha = .92 * open;
      ctx.fillStyle = DUSK;
      ctx.fillRect(0, top, W, half * 2);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, top, W, half * 2); ctx.clip();
      ctx.globalAlpha = .46 * open;
      ctx.strokeStyle = VIOLET;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0, m = n(12, liteFx); i < m; i++) {
        const y = sy + (hash(i, 3) - .5) * sh;
        const x = (hash(i, 4) * W + el * 1050) % W;
        const from = dir > 0 ? x : W - x;
        ctx.moveTo(from, y); ctx.lineTo(from + dir * (50 + hash(i, 7) * 120), y);
      }
      ctx.stroke();
      ctx.globalAlpha = open;
      const im = images?.get(GLARE_CUTIN);
      const cx = W / 2;
      if (im?.naturalWidth) {
        ctx.save();
        ctx.translate(cx, sy);
        ctx.scale(dir, 1);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, -sw / 2, -sh / 2, sw, sh);
        ctx.restore();
      } else {
        // No picture yet: two half-lidded eyes looking down the nose.
        ctx.fillStyle = '#f4ecff';
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(cx + s * 70, sy + 6, 40, 12, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#6d4fae';
          ctx.beginPath(); ctx.arc(cx + s * 70 + dir * 10, sy + 4, 8, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#f4ecff';
        }
      }
      ctx.restore();
      ctx.globalAlpha = .9 * open;
      ctx.fillStyle = VIOLET;
      ctx.fillRect(0, top - 3, W, 3);
      ctx.fillRect(0, bottom, W, 3);
      ctx.fillStyle = '#efe6ff';
      ctx.fillRect(cx - sw / 2, top - 3, sw, 1);
      ctx.fillRect(cx - sw / 2, bottom + 2, sw, 1);
      break;
    }
    case 'chisato-trash': {
      // On them for as long as 脆弱 holds: a little grey rain cloud over the head, dripping, and a 「不可回收」 tag.
      const a = fadeIO(el, e.life, .15, .3);
      const top = e.y - h - 34 + Math.sin(el * 2) * 2;
      ctx.globalAlpha = a * .9;
      ctx.fillStyle = '#9a97a8';
      for (const [dx, dy, r] of [[-14, 2, 11], [0, -4, 14], [15, 2, 10], [4, 6, 11]] as const) {
        ctx.beginPath(); ctx.arc(e.x + dx, top + dy, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#b7c7e6';
      for (let i = 0, m = n(5, liteFx); i < m; i++) {
        const k = cycle(el, 1.6, i, 2);
        ctx.globalAlpha = a * (1 - k) * .9;
        ctx.fillRect(e.x - 14 + i * 7, top + 12 + k * 34, 1.6, 6);
      }
      // The tag, hung on the shoulder at a slant.
      const tx = e.x - 22, ty = e.y - h * .66;
      ctx.globalAlpha = a;
      ctx.translate(tx, ty);
      ctx.rotate(-.18 + Math.sin(el * 3) * .04);
      ctx.fillStyle = '#f2efe6';
      ctx.strokeStyle = '#6c6880';
      ctx.lineWidth = 1.5;
      rrect(ctx, -26, -9, 52, 18, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6c6880';
      dot(ctx, -21, 0, 2);
      stampText(ctx, '不可回收', 3, 0, 10, '#4d4860');
      break;
    }
    case 'chisato-star': {
      // 冰川日菜 does not get it at all.
      ctx.globalAlpha = Math.min(1, e.life / .25);
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, e.x, e.y - ease(el / .3) * 8, 10 * (1 + .2 * Math.sin(el * 14)));
      ctx.fillStyle = '#55DDEE';
      sparkle(ctx, e.x, e.y - ease(el / .3) * 8, 6);
      break;
    }
    /* -- L 有必要说教一下呢 -- */
    case 'chisato-gogo': {
      // ゴゴゴ: three violet glyphs breathing up behind her for the whole lecture.
      const a = fadeIO(el, e.life, .2, .3);
      for (let i = 0; i < 3; i++) {
        const k = cycle(el, .55, i, 3);
        const x = e.x - dir * (36 + i * 22) + Math.sin(el * 3 + i) * 3;
        const y = e.y - h * (.55 + .3 * hash(i, 4)) - k * 30;
        ctx.globalAlpha = a * Math.sin(k * Math.PI) * .85;
        stampText(ctx, 'ゴ', x, y, 26 + i * 4, '#b9a3ee', DUSK);
      }
      break;
    }
    case 'chisato-split': {
      // A torn manga gutter between her shoujo panel and their gloomy one.
      const a = fadeIO(el, e.life, .2, .3);
      const mid = clamp(e.x, 120, W - 120);
      const herLeft = dir > 0;
      const gutter = (i: number) => mid + (hash(i, 14) - .5) * 24;
      const panel = (edge: number) => {
        ctx.beginPath();
        ctx.moveTo(edge, 0);
        for (let i = 0; i <= 12; i++) ctx.lineTo(gutter(i), i * H / 12);
        ctx.lineTo(edge, H);
        ctx.closePath();
        ctx.fill();
      };
      ctx.globalAlpha = a * .32;
      ctx.fillStyle = '#ffe6b8';
      panel(herLeft ? 0 : W);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = a * .58;
      ctx.fillStyle = '#5a4a80';
      panel(herLeft ? W : 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a * .65;
      ctx.strokeStyle = DUSK;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(gutter(0), 0);
      for (let i = 1; i <= 12; i++) ctx.lineTo(gutter(i), i * H / 12);
      ctx.stroke();
      ctx.strokeStyle = '#fff2dd';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Gloom lines on their half.
      ctx.globalAlpha = a * .3;
      ctx.strokeStyle = '#8c7bb8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0, m = n(14, liteFx); i < m; i++) {
        const x = mid + dir * (28 + (i + .5) * ((herLeft ? W - mid : mid) - 28) / m);
        ctx.moveTo(x, 40 + hash(i, 1) * 60); ctx.lineTo(x, 200 + hash(i, 2) * 120);
      }
      ctx.stroke();
      // Flowers and bubbles on hers.
      for (let i = 0, m = n(5, liteFx); i < m; i++) {
        const x = herLeft ? mid - 60 - hash(i, 3) * (mid - 80) : mid + 60 + hash(i, 3) * (W - mid - 80);
        const y = 60 + hash(i, 4) * 260;
        ctx.globalAlpha = a * .45;
        flower(ctx, x, y, 18 + hash(i, 5) * 12, el * .5 + i, i % 2 ? GOLD : BLUSH, GOLD_DEEP);
      }
      ctx.strokeStyle = 'rgba(255,248,214,.9)';
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1.5;
      for (let i = 0, m = n(6, liteFx); i < m; i++) {
        const k = cycle(el, .35, i, 6);
        const x = herLeft ? mid - 40 - hash(i, 7) * (mid - 60) : mid + 40 + hash(i, 7) * (W - mid - 60);
        ctx.globalAlpha = a * Math.sin(k * Math.PI) * .7;
        bubble(ctx, x, FLOOR - k * 320, 3 + hash(i, 8) * 6);
      }
      break;
    }
    case 'chisato-cushion': {
      // 座布团 under them: a fat square cushion seen from the side, with tassels at the corners.
      const pop = el < .12 ? .6 + ease(el / .12) * .4 : 1;
      ctx.globalAlpha = Math.min(1, e.life / .2);
      const w = 74 * pop, th = 14 * pop;
      ctx.fillStyle = '#8f2f4a';
      rrect(ctx, e.x - w / 2, e.y - th, w, th + 2, 6); ctx.fill();
      ctx.fillStyle = e.color;
      rrect(ctx, e.x - w / 2 + 2, e.y - th, w - 4, th - 3, 6); ctx.fill();
      ctx.strokeStyle = '#ffd7a1';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(e.x - w / 2 + 8, e.y - th * .55); ctx.lineTo(e.x + w / 2 - 8, e.y - th * .55); ctx.stroke();
      ctx.fillStyle = '#ffd7a1';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(e.x + s * (w / 2 - 1), e.y - th * .5, 3, 0, TAU); ctx.fill(); }
      break;
    }
    case 'chisato-sweat': {
      // Cold sweat on whoever is being lectured, a drop now and then.
      const a = fadeIO(el, e.life, .2, .2);
      ctx.fillStyle = e.color;
      for (let i = 0; i < 3; i++) {
        const k = cycle(el, .9, i, 9);
        ctx.globalAlpha = a * (1 - k) * .95;
        const x = e.x + dir * (16 + i * 8), y = e.y - h * (.82 - .05 * i) + k * 26;
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.quadraticCurveTo(x + 5, y, x, y + 4);
        ctx.quadraticCurveTo(x - 5, y, x, y - 7);
        ctx.fill();
      }
      break;
    }
    case 'chisato-bubble': {
      // Hit balloons pop on the damage beat. Missed balloons still drift out from her mouth.
      const k = e.hit ? 1 : ease(el / (e.max * .7));
      const impact = 1 - ease(el / .16);
      const tx = e.tx ?? 0, ty = e.ty ?? 0;
      const x = e.x + tx * k, y = e.y + ty * k - Math.sin(k * Math.PI) * 28;
      const beat = e.n ?? 0;
      const weight = e.hit ? beat / (CHISATO_BUBBLES - 1) : 0;
      if (e.hit) {
        ctx.globalAlpha = impact * .85;
        ctx.fillStyle = GOLD;
        for (let i = 1; i <= 3; i++) dot(ctx, e.x + tx * i / 5, e.y + ty * i / 5, 1.5 + i * .5);
      }
      ctx.globalAlpha = Math.min(1, e.life / .12);
      ctx.translate(x, y);
      const size = 1 + weight * .36;
      ctx.scale(size * (1 + (e.hit ? impact * .18 : 0)), size * (1 - (e.hit ? impact * .22 : 0)));
      ctx.fillStyle = beat >= 3 ? '#fff1d8' : '#ffffff';
      ctx.strokeStyle = DUSK;
      ctx.lineWidth = 2;
      rrect(ctx, -20, -15, 40, 28, 12); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-dir * 8, 12); ctx.lineTo(-dir * 16, 22); ctx.lineTo(-dir * 2, 13); ctx.closePath(); ctx.fill();
      const icon = beat < 4 ? beat : 2 + beat % 2;
      ctx.strokeStyle = '#7a5ad0';
      ctx.fillStyle = '#7a5ad0';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      if (icon === 0) {
        // ☝: a raised finger.
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -9); ctx.stroke();
        rrect(ctx, -5, 0, 10, 8, 3); ctx.fill();
      } else if (icon === 1) {
        ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
      } else if (icon === 2) {
        for (const s of [-4, 4]) { ctx.beginPath(); ctx.moveTo(s, -8); ctx.lineTo(s, 2); ctx.stroke(); dot(ctx, s, 7, 1.8); }
      } else {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(-2, -2); ctx.moveTo(2, -2); ctx.lineTo(5, -2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 5, 3, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#bfe6ff';
        dot(ctx, -4, 2, 1.6);
      }
      if (e.hit) {
        ctx.globalAlpha = impact;
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + (i - 1.5) * .5;
          ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 32, Math.sin(a) * 28);
        }
        ctx.stroke();
      }
      break;
    }
    case 'chisato-hanamaru': {
      // The red seal slams down, leaving an ink ring that spreads from the impact.
      const R = e.radius ?? 64;
      const impact = ease(el / .24);
      const slam = 1 + .6 * (1 - ease(el / .1));
      const a = Math.min(1, e.life / .3);
      ctx.translate(e.x, e.y);
      ctx.rotate(-.15);
      ctx.globalAlpha = (1 - impact) * .65;
      ctx.strokeStyle = STAMP;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R * (1.08 + impact * .65), 0, TAU); ctx.stroke();
      ctx.scale(slam, slam);
      ctx.globalAlpha = a;
      ctx.strokeStyle = STAMP;
      ctx.fillStyle = '#fff4df';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Scalloped petals round the rim.
      ctx.lineWidth = 4;
      ctx.beginPath();
      const petals = 9;
      for (let i = 0; i <= petals; i++) {
        const a0 = i / petals * TAU;
        const x = Math.cos(a0) * R * .78, y = Math.sin(a0) * R * .78;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const am = (i - .5) / petals * TAU;
          ctx.quadraticCurveTo(Math.cos(am) * R * 1.08, Math.sin(am) * R * 1.08, x, y);
        }
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // The spiral in the middle.
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const r = R * .62 * t;
        const ang = t * TAU * 2.6;
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      break;
    }
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  // The 花丸's petals ride outside the stamp's transform.
  if (e.type === 'chisato-hanamaru') {
    ctx.save();
    burst(el, 23, { n: n(14, liteFx), speed: [140, 320], life: .6, gravity: 220, drag: .3 }, (x, y, q, i) => {
      ctx.globalAlpha = 1 - q;
      petal(ctx, x, y, 6 * (1 - q * .4), el * 5 + i, i % 2 ? '#ff9fb4' : GOLD);
    }, e.x, e.y);
    ctx.restore();
  }
  return true;
}

/* ---- 混乱 look: 'chisato-doodle' (statusMarks.ts) ---- */

/** Over the head of whoever 珍妮弗 bit: three crayon question marks bobbing, and a tiny 珍妮弗 trotting round them.
 *  On 丸山彩 the marks read 「！？」. */
export function drawDoodleDizzy(ctx: CanvasRenderingContext2D, x: number, headY: number, t: number, aya: boolean, images?: ImageCache): void {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const bob = Math.sin(t * 5 + i * 2.1) * 4;
    ctx.globalAlpha = .9;
    stampText(ctx, aya && i === 1 ? '！？' : '？', x + (i - 1) * 24, headY - 18 + bob - (i === 1 ? 8 : 0), i === 1 ? 26 : 20, CRAYON_FILL, CRAYON);
  }
  const a = t * 2.4;
  const ox = Math.cos(a) * 34, oy = Math.sin(a) * 8;
  ctx.globalAlpha = .95;
  jennifer(ctx, x + ox, headY - 6 + oy, .38, Math.sin(a) > 0 ? -1 : 1, Math.floor(t * 10), t, 1, images);
  ctx.restore();
}
export function drawDoodleLand(ctx: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  ctx.save();
  burst(age, 61, { n: 8, speed: [60, 160], life: .5, gravity: 200, angle: -Math.PI / 2, spread: 2.4 }, (px, py, q, i) => {
    ctx.globalAlpha = 1 - q;
    ctx.fillStyle = i % 2 ? CRAYON : GOLD_DEEP;
    ctx.fillRect(px - 2.5, py - 1, 5, 2.5);
  }, x, y);
  ctx.restore();
}

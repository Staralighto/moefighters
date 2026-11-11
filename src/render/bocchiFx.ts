import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import type { Effect, Projectile } from '../game/game.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { BOCCHI_HERO, bocchiSoloBeat } from './clips.ts';
import { TAU, dot, easeOut, hash, sparkle, stampText } from './fxParticles.ts';

/* 后藤一里（波奇）. She is the one fighter whose moves are not thrown in her own shape, so four separate pictures
   carry them and this file only moves them: box.png (完熟芒果), tsuchinoko.png (下北泽槌子蛇), kaiju.png (承认欲求
   怪兽), crumble.png (崩坏). Every picture is 256×256, transparent, standing on the same 12 px foot margin as a
   sprite cell; the tsuchinoko, the kaiju and the scribble face right and are mirrored with her, the box never is
   (its lettering would read backwards). Until a picture has loaded, a plain stand-in is drawn in its place. */

/** Painted under every body. */
export const BOCCHI_BACK: readonly string[] = ['bocchi-kaiju', 'bocchi-alone'];
/** Screen space, behind every body. */
export const BOCCHI_SCREEN_BACK: readonly string[] = ['bocchi-stage'];

const BOX = '/sprites/bocchi/box.png';
const TSUCHI = '/sprites/bocchi/tsuchinoko.png';
const KAIJU = '/sprites/bocchi/kaiju.png';
const CRUMBLE = '/sprites/bocchi/crumble.png';

const PINK = '#F5A9C0';
const HOT = '#ff5c9a';
const INK = '#1a1020';
const DUST = '#f3ead8';
const CARD = '#d9b47a';
/** A 256 picture drawn `s` wide sits this far below its own bottom edge, so its foot margin lands on the floor. */
const FOOT = 12 / 256;

const bump = (t: number) => Math.sin(Math.PI * clamp(t, 0, 1));

function art(images: ImageCache | undefined, src: string): HTMLImageElement | null {
  const im = images?.get(src);
  return im?.naturalWidth ? im : null;
}
/** A picture standing on the origin, `s` wide. */
function stand(ctx: CanvasRenderingContext2D, im: CanvasImageSource, s: number): void {
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, -s / 2, -s + s * FOOT, s, s);
}
/** Round dust: a few flat balls spreading along the floor. */
function puff(ctx: CanvasRenderingContext2D, p: number, r: number, seed: number, n: number): void {
  ctx.fillStyle = DUST;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const d = r * (.3 + hash(i, seed) * .9) * easeOut(p);
    ctx.globalAlpha = (1 - p) * .8;
    dot(ctx, side * d, -4 - hash(i, seed + 1) * r * .5 * p, (5 + hash(i, seed + 2) * 7) * (1 - p * .5));
  }
}

/* ---- stand-ins, drawn only until the pictures arrive ---- */

function plainBox(ctx: CanvasRenderingContext2D, s: number): void {
  const w = s * .74, h = s * .56;
  ctx.fillStyle = CARD;
  ctx.fillRect(-w / 2, -h, w, h);
  ctx.fillStyle = '#c29a5e';
  ctx.fillRect(-w / 2, -h, w, h * .16);
  ctx.fillStyle = '#f0a03c';
  ctx.beginPath(); ctx.ellipse(0, -h * .45, w * .2, h * .22, 0, 0, TAU); ctx.fill();
}
function plainSnake(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = PINK;
  ctx.beginPath(); ctx.ellipse(0, -s * .13, s * .4, s * .13, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * .32, -s * .13); ctx.lineTo(-s * .5, -s * .2); ctx.lineTo(-s * .34, -s * .05); ctx.fill();
  ctx.fillStyle = INK;
  dot(ctx, s * .28, -s * .16, 3);
}
function plainKaiju(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#7fbf6a';
  ctx.beginPath(); ctx.ellipse(0, -s * .36, s * .26, s * .36, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s * .06, -s * .74, s * .17, 0, TAU); ctx.fill();
  ctx.fillStyle = PINK;
  ctx.beginPath(); ctx.arc(s * .1, -s * .72, s * .09, 0, TAU); ctx.fill();
}
function plainScribble(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = PINK;
  ctx.beginPath(); ctx.ellipse(0, -s * .1, s * .44, s * .1, 0, 0, TAU); ctx.fill();
}

/** The white spiky burst behind the collapse. */
function spikes(ctx: CanvasRenderingContext2D, r: number, n: number, seed: number): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = i / (n * 2) * TAU;
    const d = i % 2 ? r * .45 : r * (.8 + hash(i, seed) * .35);
    const x = Math.cos(a) * d, y = Math.sin(a) * d * .55;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/* ---- 给我点赞: the thumb ---- */

let thumb: HTMLCanvasElement | null | undefined;
function thumbStamp(): HTMLCanvasElement | null {
  if (thumb !== undefined) return thumb;
  thumb = null;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.translate(32, 34);
  g.lineJoin = 'round';
  g.lineWidth = 5;
  g.strokeStyle = HOT;
  g.fillStyle = '#ffffff';
  const shape = () => {
    g.beginPath();
    // Thumb up, then the fist under it, then the cuff.
    g.roundRect(-7, -24, 12, 22, 6);
    g.roundRect(-9, -8, 24, 22, 6);
    g.roundRect(-20, -6, 8, 20, 3);
  };
  shape(); g.stroke();
  shape(); g.fill();
  thumb = c;
  return c;
}

/* ---- 吉他英雄: the comments ---- */

/** What the scroll says. The first six are the ones that hit (Projectile.wave indexes this list). */
const DANMAKU: readonly string[] = ['波门', '吉他英雄！！', '神中神', '前方高能', '啊啊啊啊啊啊', '波奇酱好帅', '88888888', '泪目', '这就是摇滚', '下北泽的星'];
const DANMAKU_INK: readonly string[] = ['#ffffff', '#ffffff', '#ffe46b', '#ffffff', HOT, '#ffffff', '#8fe8ff'];
/** The wall of comments behind the stage: lane heights and speeds are rolled once. */
const WALL = 9;

/** Pink forks fan from the guitar on each downstroke and grow during the last phrase. */
const SOLO_ARCS = [-.58, -2.45, .44] as const;
export function drawBocchiSolo(ctx: CanvasRenderingContext2D, f: Fighter, lite: boolean): void {
  const a = f.attack;
  if (!a || (a.mode ?? BOCCHI_HERO.play) !== BOCCHI_HERO.play) return;
  const beat = bocchiSoloBeat(a);
  const phase = beat % 1;
  if (beat < 0 || phase >= .66) return;

  const index = Math.floor(beat);
  const p = phase / .66;
  const h = f.data.view.kind === 'sprite' ? f.data.view.height : 181;
  const accent = index >= (a.skill.count ?? 1) - 1;
  const reach = (accent ? 104 : 76) + 28 * easeOut(p);
  ctx.save();
  ctx.translate(Math.round(f.x + f.facing * h * .08), Math.round(f.y - h * .37));
  ctx.scale(f.facing, 1);
  ctx.globalAlpha = (1 - p) ** 1.4;
  ctx.lineJoin = 'bevel';
  ctx.beginPath();
  for (let i = 0; i < (lite ? 2 : SOLO_ARCS.length); i++) {
    const angle = SOLO_ARCS[i] + (hash(index, i + 4) - .5) * .36;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const length = reach * (i === 0 ? 1 : .72);
    const kink = (i % 2 ? -1 : 1) * 13;
    ctx.moveTo(dx * 6, dy * 6);
    ctx.lineTo(dx * length * .38 - dy * kink, dy * length * .38 + dx * kink);
    ctx.lineTo(dx * length * .55 + dy * kink, dy * length * .55 - dx * kink);
    ctx.lineTo(dx * length, dy * length);
  }
  ctx.strokeStyle = HOT;
  ctx.lineWidth = accent ? 9 : 7;
  ctx.stroke();
  ctx.strokeStyle = '#ffe6f7';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffe6f7';
  sparkle(ctx, 0, 0, (accent ? 15 : 10) * (1 - p));
  ctx.restore();
}

export function drawBocchiShot(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): boolean {
  if (p.fx === 'bocchi-like') {
    const dir = Math.sign(p.vx) || 1;
    const fade = Math.min(1, p.age / .06, p.life / .1);
    ctx.save();
    ctx.translate(p.x, p.y);
    // A short pink wake, then the thumb itself, tipping a little as it flies.
    ctx.fillStyle = PINK;
    const wake = lite ? 2 : 4;
    for (let i = 1; i <= wake; i++) {
      ctx.globalAlpha = fade * .5 * (1 - i / (wake + 1));
      dot(ctx, -dir * i * 13, Math.sin(p.age * 20 + i) * 2, 7 - i);
    }
    ctx.globalAlpha = fade;
    ctx.rotate(Math.sin(p.age * 16 + p.y) * .18);
    const st = thumbStamp();
    if (st) ctx.drawImage(st, -19, -19, 38, 38);
    else { ctx.fillStyle = '#ffffff'; dot(ctx, 0, 0, 12); }
    ctx.restore();
    return true;
  }
  if (p.fx === 'bocchi-hero') {
    const i = Math.round(p.wave ?? 0);
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.age / .08, p.life / .12);
    const text = DANMAKU[i % DANMAKU.length];
    if (stampText(ctx, text, p.x, p.y, 24, DANMAKU_INK[i % DANMAKU_INK.length], INK) < 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 40, p.y - 8, 80, 16);
    }
    ctx.restore();
    return true;
  }
  return false;
}

export function drawBocchiFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean, images?: ImageCache): boolean {
  if (!e.type.startsWith('bocchi-')) return false;
  const p = 1 - e.life / e.max;
  const t = e.cast && e.until !== undefined ? e.until + e.cast.tail - e.life : e.max - e.life;
  const dir = e.dir ?? 1;
  const h = e.radius ?? 181;
  ctx.save();
  if (e.type === 'bocchi-stage') {
    // Screen space. The house lights go down behind everyone (bodies stay as bright as they were), two beams
    // cross on her, and the comment wall scrolls by behind the stage.
    const a = Math.min(1, (e.until ?? t) / .25, e.life / .3);
    ctx.globalAlpha = a * .5;
    ctx.fillStyle = '#0d0716';
    ctx.fillRect(0, 0, W, H);
    const n = lite ? 5 : WALL;
    for (let i = 0; i < n; i++) {
      const speed = 150 + hash(i, 3) * 130;
      const span = W + 360;
      const x = W + 180 - ((t * speed + hash(i, 1) * span) % span);
      ctx.globalAlpha = a * .34;
      stampText(ctx, DANMAKU[(i + 3) % DANMAKU.length], x, 34 + i * (FLOOR - 190) / n, 20, '#ffffff', '');
    }
    ctx.fillStyle = '#ffd9e6';
    for (const side of [-1, 1]) {
      ctx.globalAlpha = a * .13;
      ctx.beginPath();
      ctx.moveTo(e.x + side * 250, 0);
      ctx.lineTo(e.x + side * 300, 0);
      ctx.lineTo(e.x + 95, FLOOR + 8);
      ctx.lineTo(e.x - 95, FLOOR + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = a * .22;
    ctx.beginPath(); ctx.ellipse(e.x, FLOOR + 4, 100, 14, 0, 0, TAU); ctx.fill();
    ctx.restore();
    return true;
  }
  ctx.translate(e.x, e.y);
  switch (e.type) {
    case 'bocchi-alone': {
      // 一个人才行: nobody near. One ring opens on the floor and a few glints lift off it.
      const k = easeOut(p);
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.globalAlpha = (1 - p) * .8;
      ctx.beginPath(); ctx.ellipse(0, 0, 30 + 60 * k, 6 + 10 * k, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = bump(p) * .9;
        sparkle(ctx, (i - 1) * 34, -h * (.25 + .5 * k) - i * 9, 6 + i);
      }
      break;
    }
    case 'bocchi-puff':
      puff(ctx, p, e.radius ?? 34, 5, lite ? 4 : 7);
      break;
    /* ---- U 完熟芒果 ---- */
    case 'bocchi-box': {
      // The box drops over her and slides: it rocks on its edges, dust comes off the back.
      const drop = easeOut(Math.min(1, t / .09));
      const s = 172;
      ctx.fillStyle = DUST;
      for (let i = 0; i < (lite ? 2 : 4); i++) {
        const k = (t * 3.2 + hash(i, 2)) % 1;
        ctx.globalAlpha = (1 - k) * .7 * drop;
        dot(ctx, -dir * (50 + k * 70), -5 - k * 18 - hash(i, 4) * 10, 5 + k * 6);
      }
      ctx.globalAlpha = Math.min(1, e.life / .06);
      ctx.translate(0, -(1 - drop) * 60 - Math.abs(Math.sin(t * 19)) * 3);
      ctx.rotate(Math.sin(t * 19) * .045);
      ctx.scale(1 + (1 - drop) * .15, drop * .15 + .85);
      const im = art(images, BOX);
      if (im) stand(ctx, im, s); else plainBox(ctx, s);
      break;
    }
    case 'bocchi-box-pop': {
      // Lift off from the standing box's position and spin around its center.
      const s = 172;
      const pivot = s * .3;
      ctx.translate(-dir * p * 90, -Math.sin(p * Math.PI) * 110 - p * 20 - pivot);
      ctx.rotate(-dir * p * 2.6);
      ctx.globalAlpha = 1 - p * p;
      ctx.translate(0, pivot);
      const im = art(images, BOX);
      if (im) stand(ctx, im, s); else plainBox(ctx, s);
      break;
    }
    /* ---- I 下北泽槌子蛇 ---- */
    case 'bocchi-tsuchi': {
      // Flat on the floor and fast: the body bunches and stretches, dust behind.
      const s = 138;
      const k = Math.sin(t * 30);
      ctx.fillStyle = DUST;
      for (let i = 0; i < (lite ? 2 : 4); i++) {
        const u = (t * 4 + hash(i, 6)) % 1;
        ctx.globalAlpha = (1 - u) * .65;
        dot(ctx, -dir * (46 + u * 60), -4 - u * 12, 4 + u * 5);
      }
      ctx.globalAlpha = Math.min(1, t / .05, e.life / .06);
      ctx.scale(dir * (1 + k * .1), 1 - k * .09);
      const im = art(images, TSUCHI);
      if (im) stand(ctx, im, s); else plainSnake(ctx, s);
      break;
    }
    case 'bocchi-bite': {
      // Two fangs close on the ankle.
      const k = easeOut(Math.min(1, p * 2.2));
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 1 - p * p;
      for (const side of [-1, 1]) {
        const y = side * 20 * (1 - k);
        ctx.beginPath(); ctx.moveTo(-12, y - side * 2); ctx.lineTo(12, y - side * 2); ctx.lineTo(0, y + side * 16); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = HOT;
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + .4;
        ctx.globalAlpha = (1 - p) * .9;
        sparkle(ctx, Math.cos(a) * 34 * k, Math.sin(a) * 26 * k, 7 * (1 - p) + 2);
      }
      break;
    }
    /* ---- O 给我点赞 ---- */
    case 'bocchi-kaiju': {
      const s = Math.round(h * 1.9);
      const riseTime = Math.max(.12, e.t0 ?? .3);
      const rise = easeOut(Math.min(1, (e.until ?? t) / riseTime));
      const sink = Math.min(1, e.life / .18);
      const up = rise * sink;
      // Unfold from the feet inside the dust instead of clipping the sprite at the floor.
      const bodyW = Math.round(s * (1 + .12 * bump(up)));
      const bodyH = Math.round(s * (.14 + .86 * up));
      const recoil = sink === 1 && t >= riseTime && t < riseTime + .54 && Math.floor((t - riseTime) * 24) % 2 === 0 ? 4 : 0;
      ctx.save();
      ctx.translate(0, -recoil);
      ctx.globalAlpha = Math.min(1, up * 2);
      ctx.scale(dir, 1);
      const im = art(images, KAIJU);
      if (im) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, -Math.round(bodyW / 2), -bodyH + Math.round(bodyH * FOOT), bodyW, bodyH);
      } else {
        ctx.scale(bodyW / s, bodyH / s);
        plainKaiju(ctx, s);
      }
      ctx.restore();

      // A bank of stepped dust opens around the feet, then breaks into the square chips.
      const cloud = sink < 1 ? bump(1 - sink)
        : Math.min(1, t / .045) * clamp(1 - (t - .065) / riseTime, 0, 1);
      if (cloud > .02) {
        const spread = s * (.055 + .025 * (1 - cloud));
        ctx.globalAlpha = cloud * .94;
        ctx.fillStyle = '#c6a48e';
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) {
          const x = Math.round(i * spread * 1.65);
          const top = -Math.round((.084 - .017 * Math.abs(i)) * s * cloud);
          ctx.rect(x - spread, top + 7, spread * 2, 2 - top);
          ctx.rect(x - spread * .7, top, spread * 1.4, 7);
        }
        ctx.fill();
        ctx.fillStyle = DUST;
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) {
          const x = Math.round(i * spread * 1.65);
          const top = -Math.round((.084 - .017 * Math.abs(i)) * s * cloud);
          ctx.rect(x - spread * .7, top + 3, spread * 1.4, 7);
        }
        ctx.fill();
      }

      const dust = sink < 1 ? 1 - sink : t / (riseTime + .12);
      if (dust < 1) {
        ctx.fillStyle = DUST;
        ctx.globalAlpha = .8 * (1 - dust) * Math.min(1, t * 30);
        for (let i = 0; i < (lite ? 4 : 8); i++) {
          const x = (i % 2 ? 1 : -1) * s * (.09 + hash(i, 21) * .25) * easeOut(dust);
          const y = -5 - 48 * hash(i, 22) * bump(dust);
          const size = Math.round(5 + 10 * hash(i, 23) * (1 - dust));
          ctx.fillRect(Math.round(x), Math.round(y), size, size);
        }
      }

      // A comic shout follows the rise and clears before the thumbs cross the stage.
      const shout = ((e.until ?? t) - riseTime * .58) / .35;
      if (shout >= 0 && shout < 1) {
        const push = easeOut(shout);
        const x = s * (.28 + .1 * push), y = -s * (.65 + .07 * push);
        ctx.globalAlpha = sink * Math.min(1, shout * 8, (1 - shout) * 3);
        ctx.fillStyle = '#ffe46b';
        ctx.beginPath();
        for (let i = 0; i < (lite ? 2 : 3); i++) {
          const dy = (i - 1) * 18;
          ctx.moveTo(dir * (x - 27), y + dy * .55);
          ctx.lineTo(dir * (x - 48), y + dy - 4);
          ctx.lineTo(dir * (x - 47), y + dy + 5);
        }
        ctx.fill();
        stampText(ctx, '赞！', dir * x, y, 29, '#ffe46b', INK);
      }
      break;
    }
    case 'bocchi-heart': {
      // A thumb landed.
      const k = easeOut(p);
      ctx.fillStyle = HOT;
      ctx.globalAlpha = 1 - p;
      const r = 6 + 9 * k;
      ctx.translate(0, -k * 18);
      ctx.beginPath();
      ctx.moveTo(0, r * .9);
      ctx.bezierCurveTo(-r * 1.5, -r * .2, -r * .6, -r * 1.2, 0, -r * .35);
      ctx.bezierCurveTo(r * .6, -r * 1.2, r * 1.5, -r * .2, 0, r * .9);
      ctx.fill();
      break;
    }
    /* ---- L 吉他英雄 ---- */
    case 'bocchi-flop': {
      // Face first. Dust both ways and a ring of short white ticks along the floor.
      puff(ctx, p, 70, 9, lite ? 5 : 9);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.globalAlpha = (1 - p) * .9;
      const k = easeOut(p);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i + .5) / 7 * Math.PI;
        const r0 = 34 + 40 * k, r1 = r0 + 16 * (1 - p);
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * .5);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * .5);
      }
      ctx.stroke();
      break;
    }
    /* ---- 崩坏 ---- */
    case 'bocchi-crumble': {
      // The color offsets are in the sprite. Shake the whole drawing over the white burst.
      const s = h * 1.28;
      const pop = easeOut(Math.min(1, t / .1));
      const out = Math.min(1, e.life / .08);
      const boil = Math.floor(t * 11);
      const im = art(images, CRUMBLE);
      ctx.globalAlpha = out * (.55 + .45 * (1 - Math.min(1, t / .3)));
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(0, -h * .14);
      spikes(ctx, s * .62 * (.7 + .3 * pop), 9, boil % 3);
      ctx.restore();
      ctx.globalAlpha = out;
      ctx.translate((hash(boil, 1) - .5) * 4, (hash(boil, 2) - .5) * 3);
      ctx.rotate((hash(boil, 3) - .5) * .05);
      ctx.scale(dir * (1.25 - .25 * pop), .8 + .2 * pop);
      if (im) stand(ctx, im, s); else plainScribble(ctx, s);
      break;
    }
    case 'bocchi-sand': {
      // Sanded back into shape: a block of sandpaper goes over her three times and the dust comes off white.
      const strokes = 3;
      const u = p * strokes;
      const pass = Math.min(strokes - 1, Math.floor(u));
      const k = u - pass;
      const x = (pass % 2 ? 1 - k : k) * 2 - 1;
      const y = -h * (.82 - pass * .26);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < (lite ? 4 : 8); i++) {
        const q = (p * 2.2 + hash(i, 7)) % 1;
        ctx.globalAlpha = (1 - q) * .85 * (1 - p * .4);
        dot(ctx, (hash(i, 8) - .5) * 70, -h * (.15 + hash(i, 9) * .75) + q * 26, 2.5 + hash(i, 10) * 3);
      }
      ctx.globalAlpha = Math.min(1, e.life / .08);
      ctx.translate(x * 34, y);
      ctx.rotate(x * .18);
      ctx.fillStyle = '#b98a54';
      ctx.fillRect(-20, -9, 40, 18);
      ctx.fillStyle = '#e2c79a';
      ctx.fillRect(-20, 5, 40, 4);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = bump(k) * .9;
      sparkle(ctx, -x * 26, 12, 9);
      break;
    }
    default:
      break;
  }
  ctx.restore();
  return true;
}

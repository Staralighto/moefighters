import type { Effect, Projectile } from '../game/game.ts';
import type { ImageCache } from '../assets/loader.ts';
import type { Fighter } from '../game/fighter.ts';
import type { FighterView } from './view.ts';
import { FLOOR, H, W, clamp } from '../game/constants.ts';
import { CELL, TOKO_FIVE, TOKO_MASTER_AT, TOKO_MASTER_HEIGHT, TOKO_MASTER_IN, TOKO_MASTER_SRC, TOKO_SOLO_FINAL } from './clips.ts';
import { TAU, burst, cycle, dot, glow, glyph, hash, sparkle, stampText } from './fxParticles.ts';

/* 桐谷透子 — 闪光灯、糊音、「哈」和聚光灯. Four registers:
   - her red (#EE6666) with white: the polaroid frame, the laugh, the pillar and the waves;
   - mud: a grey-brown, lopsided note that wobbles and sinks (the guitar she cannot play yet);
   - 纱夜's teal for the one moment her teacher steps in (her own sheet, her own arrow);
   - stage light for 天上天下 本小姐独尊: the house a shade darker, three warm spots on her, and at the end the one
     light splitting into the five colours of Morfonica.
   All flat shapes that read from across the screen; the busiest moment, the five beams, is five quads. */

/** Under every body, in world space: 纱夜 behind her, and the dimmed house with its three spots. */
export const TOKO_BACK: readonly string[] = ['toko-master', 'toko-spot'];

const RED = '#EE6666';
const RED_DEEP = '#d8434f';
const MUD = '#8a7a6a';
const MUD_DARK = '#5d5148';
const TEAL = '#00AABB';

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;
const ease = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;

function image(images: ImageCache | undefined, src: string): HTMLImageElement | undefined {
  const im = images?.get(src);
  return im && im.naturalWidth ? im : undefined;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** The muddy note: a lopsided head that never holds its shape, a bent stem, a drip. */
function mudNote(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.fillStyle = MUD_DARK;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = i / 10 * TAU;
    const k = r * (1.12 + Math.sin(a * 3 + t * 9) * .16 + Math.sin(a * 2 - t * 6) * .1);
    const px = x + Math.cos(a) * k * 1.15, py = y + Math.sin(a) * k * .9;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = MUD;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = i / 10 * TAU;
    const k = r * (.92 + Math.sin(a * 3 + t * 9) * .16 + Math.sin(a * 2 - t * 6) * .1);
    const px = x + Math.cos(a) * k * 1.15, py = y + Math.sin(a) * k * .9;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  // The stem droops over instead of standing up.
  ctx.strokeStyle = MUD_DARK;
  ctx.lineWidth = Math.max(3, r * .26);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + r * .9, y - r * .2);
  ctx.quadraticCurveTo(x + r * 1.1, y - r * 2.2, x + r * 2 + Math.sin(t * 7) * r * .3, y - r * 1.5);
  ctx.stroke();
  ctx.fillStyle = '#b3a596';
  dot(ctx, x - r * .35, y - r * .25, r * .22);
}

export function drawTokoShot(ctx: CanvasRenderingContext2D, p: Projectile, _liteFx: boolean): boolean {
  if (p.fx !== 'toko-mud') return false;
  ctx.save();
  // It sinks as it goes and shakes like a note held wrong.
  const sink = p.age * p.age * 70;
  const y = p.y + sink + Math.sin(p.age * 26) * 3;
  ctx.globalAlpha = Math.min(1, p.life / .15);
  for (let i = 0; i < 2; i++) {
    const k = cycle(p.age, 2.4, i, 31);
    ctx.globalAlpha = Math.min(1, p.life / .15) * (1 - k) * .8;
    ctx.fillStyle = MUD;
    dot(ctx, p.x - (Math.sign(p.vx) || 1) * (10 + i * 12), y + 8 + k * 26, 4 - k * 2);
  }
  ctx.globalAlpha = Math.min(1, p.life / .15);
  mudNote(ctx, p.x, y, Math.max(13, p.size * .28), p.age);
  ctx.restore();
  return true;
}

/** A cracked little shield: 破防. */
function crackedShield(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, split: number): void {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * split, y + Math.abs(split) * .4);
    ctx.rotate(side * split * .03);
    ctx.beginPath();
    // Half a shield, the inner edge a zigzag.
    ctx.moveTo(0, -s);
    ctx.lineTo(side * s * .85, -s * .7);
    ctx.lineTo(side * s * .8, s * .1);
    ctx.quadraticCurveTo(side * s * .55, s * .8, 0, s * 1.1);
    ctx.lineTo(side * s * .16, s * .5);
    ctx.lineTo(-side * s * .12, s * .05);
    ctx.lineTo(side * s * .14, -s * .45);
    ctx.closePath();
    ctx.fillStyle = 'rgba(191,230,255,.35)';
    ctx.fill();
    ctx.strokeStyle = '#eaf7ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

/* ---- baked light (one small canvas per colour, stretched at draw time) ----
   Screen keeps the warm atmosphere soft; the five-colour finale adds light with 'lighter'.
   Shafts have an even fill with a short edge fade; gradients are baked once. */

const rgbOf = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return `${v >> 16 & 255},${v >> 8 & 255},${v & 255}`;
};
const RED_RGB = rgbOf(RED);
const GOLD_RGB = '255,217,138';
const WARM_RGB = '255,241,214';
const WAVE_RGB = [RED_RGB, '255,150,120', GOLD_RGB];
// Member colours are print-like midtones; stage lamps keep their hue at full channel intensity.
const FIVE_RGB = TOKO_FIVE.map(hex => {
  const channels = rgbOf(hex).split(',').map(Number);
  const peak = Math.max(...channels);
  return channels.map(v => Math.round(v * 255 / peak)).join(',');
});

/** Light the cached sprite silhouette itself; beams behind the sprite cannot illuminate it. */
export function drawTokoSoloLight(ctx: CanvasRenderingContext2D, f: Fighter, view: FighterView, y: number, alpha: number): void {
  const a = f.attack;
  if (f.hp <= 0 || a?.skill.fx !== 'toko-solo') return;
  const fade = Math.min(1, a.t / .25, Math.max(0, a.skill.duration - a.t) / .25);
  const finale = Math.max(0, 1 - Math.abs(a.t - TOKO_SOLO_FINAL - .12) / .35);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  view.draw(ctx, f, f.x, y, alpha * fade * (.35 + finale * .1), undefined, '#ffe3a3');
  view.draw(ctx, f, f.x, y, alpha * fade * (.12 + finale * .08), '#fff1d6');
  ctx.restore();
}

const stamps = new Map<string, HTMLCanvasElement | null>();
function bake(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  let c = stamps.get(key);
  if (c !== undefined) return c;
  c = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (g) { paint(g); c = cv; }
  }
  stamps.set(key, c);
  return c;
}
/** An even column of light, with only its outer eight percent softened. */
function shaft(rgb: string): HTMLCanvasElement | null {
  return bake('shaft' + rgb, 64, 256, g => {
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, `rgba(${rgb},0)`);
    across.addColorStop(.08, `rgba(${rgb},.68)`);
    across.addColorStop(.5, `rgba(${rgb},.72)`);
    across.addColorStop(.92, `rgba(${rgb},.68)`);
    across.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = across;
    g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const down = g.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, 'rgba(0,0,0,.85)');
    down.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = down;
    g.fillRect(0, 0, 64, 256);
  });
}
/** A soft halo ring: empty in the middle, brightest near the rim. */
function halo(rgb: string): HTMLCanvasElement | null {
  return bake('halo' + rgb, 128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(.5, `rgba(${rgb},.08)`);
    gr.addColorStop(.78, `rgba(${rgb},.6)`);
    gr.addColorStop(.86, `rgba(${rgb},.9)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}
/** A breaking crest of light, curling to the right: white along the lip, gold, then the colour thinning to nothing at
 *  the floor and along its tail. */
function crest(rgb: string): HTMLCanvasElement | null {
  return bake('crest' + rgb, 256, 128, g => {
    g.beginPath();
    g.moveTo(0, 128);
    g.bezierCurveTo(70, 122, 130, 92, 160, 42);
    g.bezierCurveTo(172, 18, 198, 2, 228, 14);
    g.bezierCurveTo(248, 22, 252, 46, 236, 54);
    g.bezierCurveTo(222, 40, 204, 40, 196, 60);
    g.bezierCurveTo(186, 88, 204, 114, 256, 128);
    g.closePath();
    const up = g.createLinearGradient(0, 0, 0, 128);
    up.addColorStop(0, 'rgba(255,250,235,.95)');
    up.addColorStop(.14, `rgba(${GOLD_RGB},.9)`);
    up.addColorStop(.45, `rgba(${rgb},.85)`);
    up.addColorStop(.8, `rgba(${rgb},.45)`);
    up.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = up;
    g.fill();
    g.globalCompositeOperation = 'destination-in';
    const tail = g.createLinearGradient(0, 0, 256, 0);
    tail.addColorStop(0, 'rgba(0,0,0,0)');
    tail.addColorStop(.5, 'rgba(0,0,0,1)');
    tail.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = tail;
    g.fillRect(0, 0, 256, 128);
  });
}
/** The light a crest leaves on the floor behind it: brightest at the crest end and at the floor. */
function carpet(rgb: string): HTMLCanvasElement | null {
  return bake('carpet' + rgb, 128, 32, g => {
    const along = g.createLinearGradient(0, 0, 128, 0);
    along.addColorStop(0, `rgba(${rgb},0)`);
    along.addColorStop(.7, `rgba(${rgb},.4)`);
    along.addColorStop(1, `rgba(${GOLD_RGB},.7)`);
    g.fillStyle = along;
    g.fillRect(0, 0, 128, 32);
    g.globalCompositeOperation = 'destination-in';
    const up = g.createLinearGradient(0, 0, 0, 32);
    up.addColorStop(0, 'rgba(0,0,0,0)');
    up.addColorStop(.75, 'rgba(0,0,0,.8)');
    up.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = up;
    g.fillRect(0, 0, 128, 32);
  });
}
/** One shaft from (x0, y0) down to (x1, y1), `w` wide. */
function drawShaft(ctx: CanvasRenderingContext2D, rgb: string, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const im = shaft(rgb);
  const height = y1 - y0;
  if (!im || !(w > 0) || !(height > 0)) return;
  ctx.save();
  // Shear, rather than rotate: both bottom corners must end exactly on the floor.
  ctx.transform(1, 0, (x1 - x0) / height, 1, x0, y0);
  ctx.drawImage(im, -w / 2, 0, w, height);
  ctx.restore();
}
/** A pool of light lying on the floor. */
function pool(ctx: CanvasRenderingContext2D, x: number, r: number, rgb: string): void {
  ctx.save();
  ctx.translate(x, FLOOR - 2);
  ctx.scale(1, .26);
  glow(ctx, 0, 0, r, rgb);
  ctx.restore();
}

const HA_LANES = [-.3, 0, .24];

export function drawTokoFx(ctx: CanvasRenderingContext2D, e: Effect, liteFx = false, images?: ImageCache): boolean {
  if (!e.type.startsWith('toko-')) return false;
  const life = e.max > 0 ? clamp(e.life / e.max, 0, 1) : 0;
  const t = 1 - life;
  const el = e.max - e.life;
  const dir = e.dir ?? 1;
  ctx.save();
  switch (e.type) {
    case 'toko-frame': {
      // 这张必火: a polaroid frame snaps on around the two of them (n 1) or thin air (n 0), holds, then drifts off
      // like a photo let go of. A caption on the wide bottom edge, two glints at the corners.
      const hold = .3;
      const pop = el < .1 ? 1.25 - ease(el / .1) * .25 : 1;
      const off = Math.max(0, el - hold);
      const w = e.n ? 210 : 120, h = e.n ? 200 : 130;
      ctx.translate(e.x + dir * off * 120, e.y - off * 150);
      ctx.rotate(-dir * (.07 + off * .9));
      ctx.scale(pop, pop);
      ctx.globalAlpha = Math.min(1, e.life / .3);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.lineJoin = 'round';
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w / 2 - 4, h / 2 - 4, w + 8, 34);
      stampText(ctx, e.n ? '#超可爱' : '#今日份的我', 0, h / 2 + 13, 17, RED_DEEP, '', 900);
      if (el < .45) {
        ctx.globalAlpha = (1 - el / .45) * Math.min(1, e.life / .3);
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, -w / 2, -h / 2, 16 + el * 30);
        sparkle(ctx, w / 2, h / 2 - 20, 11 + el * 24);
      }
      break;
    }
    case 'toko-hype': {
      // 上头: little glints climbing off her while the picture is still trending.
      const h = e.radius ?? 181;
      const fade = Math.min(1, el / .2, e.life / .3);
      for (let i = 0, n = count(5, liteFx); i < n; i++) {
        const k = cycle(el, .7, i, 41);
        ctx.globalAlpha = fade * Math.sin(k * Math.PI) * .9;
        ctx.fillStyle = i % 2 ? '#ffffff' : RED;
        sparkle(ctx, e.x + (hash(i, 42) - .5) * 70, e.y - h * (.15 + k * .85), 5 + hash(i, 43) * 4);
      }
      break;
    }
    case 'toko-master': {
      // 师父示范一下: 纱夜 behind her — her own sheet, U column: drawing, loosing, lowering. Three dots over her
      // head until she shoots; a teal ring at the release.
      const shotAt = TOKO_MASTER_AT - TOKO_MASTER_IN;
      const row = el < shotAt - .04 ? 0 : el < shotAt + .22 ? 1 : 2;
      const fade = Math.min(1, el / .1, e.life / .22);
      const h = TOKO_MASTER_HEIGHT;
      const im = image(images, TOKO_MASTER_SRC);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(dir, 1);
      ctx.globalAlpha = fade;
      if (im) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, 0, row * CELL, CELL, CELL, -h / 2, -h, h, h);
      } else {
        ctx.fillStyle = TEAL;
        rrect(ctx, -22, -h * .82, 44, h * .82, 14); ctx.fill();
        dot(ctx, 0, -h * .9, 17);
      }
      ctx.restore();
      if (el < shotAt) {
        ctx.fillStyle = '#e6f6f8';
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = fade * (el > i * .05 ? 1 : 0);
          dot(ctx, e.x - 14 + i * 14, e.y - h - 12, 3.6);
        }
      } else if (el < shotAt + .25) {
        const k = (el - shotAt) / .25;
        ctx.globalAlpha = (1 - k) * .8;
        ctx.strokeStyle = '#7ee6f0';
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(e.x + dir * 40, e.y - 86, 10 + k * 16, 30 + k * 44, 0, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'toko-laugh': {
      // 笑到你破防: 「哈」 after 「哈」 thrown out in a fan, each one bigger than the last, white under red.
      const reach = e.radius ?? 300;
      for (let i = 0, n = count(7, liteFx); i < n; i++) {
        const born = i * .055;
        const k = (el - born) / .42;
        if (k < 0 || k > 1) continue;
        const a = HA_LANES[i % 3] + (hash(i, 51) - .5) * .12;
        const d = 20 + ease(k) * (reach - 30);
        const x = e.x + dir * Math.cos(a) * d, y = e.y + Math.sin(a) * d;
        const size = 18 + ease(k) * (20 + (i % 3) * 5);
        ctx.globalAlpha = k > .75 ? (1 - k) * 4 : 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((hash(i, 52) - .5) * .5);
        ctx.fillStyle = '#ffffff';
        glyph(ctx, '哈', 0, 0, size + 6);
        ctx.fillStyle = i % 2 ? RED : RED_DEEP;
        glyph(ctx, '哈', 0, 0, size);
        ctx.restore();
      }
      break;
    }
    case 'toko-crack': {
      // 破防: a little shield over their head, split down the middle; it breaks apart as it goes on, and the two
      // halves fall away when 脆弱 lifts.
      const born = el < .35;
      const gone = e.life < .3;
      const split = born ? ease(el / .35) * 5 : gone ? 5 + (1 - e.life / .3) * 14 : 5 + Math.sin(el * 5) * .8;
      ctx.globalAlpha = Math.min(1, el / .08, e.life / .3);
      crackedShield(ctx, e.x, e.y + Math.sin(el * 3) * 2, 15, split);
      if (born) {
        burst(el, 61, { n: count(6, liteFx), speed: [60, 150], life: .35, gravity: 420 }, (x, y, q) => {
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = '#eaf7ff';
          dot(ctx, x, y, 2.4);
        }, e.x, e.y);
      }
      break;
    }
    case 'toko-spot': {
      // 天上天下 本小姐独尊: the house a shade darker and three warm spots swinging in to land on her. Drawn under the
      // bodies, so she stands in the light and stays clear.
      const a = Math.min(1, el / .25, e.life / .3);
      ctx.globalAlpha = a * .3;
      ctx.fillStyle = e.color;
      ctx.fillRect(-W, -H, W * 3, H * 3);
      const h = e.radius ?? 181;
      const lock = ease(el / .45);
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const top = e.x + (i - 1) * 260;
        const sway = (1 - lock) * (i - 1 || .6) * 240 * Math.cos(el * 7 + i);
        ctx.globalAlpha = a * (i === 1 ? .3 : .18);
        drawShaft(ctx, i === 1 ? WARM_RGB : '255,190,180', top, -20, e.x + sway, FLOOR, 190);
      }
      ctx.globalAlpha = a * lock * .18;
      pool(ctx, e.x, 120, WARM_RGB);
      ctx.globalAlpha = a * lock * .1;
      glow(ctx, e.x, FLOOR - h * .55, h * .7, GOLD_RGB);
      break;
    }
    case 'toko-pillar': {
      // 天上: the sky opens. A wide soft shaft with a gold one inside it and three slow slanting rays through the
      // pair, glitter climbing up the light, and where it lands a pool, a halo running out along the floor and a
      // crown of light thrown up. It closes to a thread and is gone.
      const open = ease(el / .14);
      const close = e.life < .3 ? e.life / .3 : 1;
      const w = (50 + open * 150) * (.2 + .8 * close);
      const a = Math.min(1, e.life / .25);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = a * .35;
      drawShaft(ctx, RED_RGB, e.x, -20, e.x, FLOOR, w);
      ctx.globalAlpha = a * .12;
      drawShaft(ctx, GOLD_RGB, e.x, -20, e.x, FLOOR, w * .5);
      for (let i = 0; i < 3; i++) {
        const lean = (i - 1) * .16 + Math.sin(el * 2.4 + i * 2) * .05;
        const x0 = e.x + (i - 1) * w * .2;
        ctx.globalAlpha = a * .05;
        drawShaft(ctx, WARM_RGB, x0 - Math.tan(lean) * FLOOR * .5, -20, x0 + Math.tan(lean) * FLOOR * .5, FLOOR, w * .4);
      }
      for (let i = 0, n = count(12, liteFx); i < n; i++) {
        const k = cycle(el, .85, i, 81);
        ctx.globalAlpha = a * Math.sin(k * Math.PI);
        ctx.fillStyle = i % 3 ? '#fff3cf' : '#ffffff';
        sparkle(ctx, e.x + (hash(i, 82) - .5) * w * .9, FLOOR - 10 - k * FLOOR * .82, 4 + hash(i, 83) * 5);
      }
      ctx.globalAlpha = a * .18;
      pool(ctx, e.x, 100 + open * 90, GOLD_RGB);
      const ring = halo(GOLD_RGB);
      if (ring) {
        const kr = ease(el / .5);
        const r = 50 + kr * 230;
        ctx.globalAlpha = (1 - kr) * .3;
        ctx.save();
        ctx.translate(e.x, FLOOR - 2);
        ctx.scale(1, .24);
        ctx.drawImage(ring, -r, -r, r * 2, r * 2);
        ctx.restore();
      }
      burst(el, 77, { n: count(9, liteFx), speed: [170, 360], life: .5, gravity: 520, angle: -Math.PI / 2, spread: 1.7 }, (x, y, q) => {
        ctx.globalAlpha = (1 - q) * .2;
        glow(ctx, x, y, 6 + (1 - q) * 14, GOLD_RGB);
      }, e.x, FLOOR - 6);
      break;
    }
    case 'toko-wave': {
      // 天下: a breaking crest of light running along the floor away from her, each of the three taller and warmer
      // than the last (her red, coral, gold). It lays a carpet of light behind it, drags a paler echo of itself,
      // and throws glitter off its lip.
      const reach = e.radius ?? 420;
      const n = e.n ?? 0;
      const rgb = WAVE_RGB[n % WAVE_RGB.length];
      const k = ease(el / e.max);
      const x = e.x + dir * k * reach;
      const hgt = 120 + n * 26;
      const wid = hgt * 2;
      const a = Math.min(1, el / .05, e.life / .22);
      ctx.globalCompositeOperation = 'screen';
      const rug = carpet(rgb);
      if (rug) {
        ctx.globalAlpha = a * .8;
        ctx.save();
        ctx.translate(e.x, FLOOR);
        ctx.scale(dir, 1);
        ctx.drawImage(rug, 0, -30, Math.max(1, Math.abs(x - e.x)), 30);
        ctx.restore();
      }
      ctx.globalAlpha = a * .35;
      pool(ctx, x, hgt, rgb);
      const lip = crest(rgb);
      if (lip) {
        ctx.save();
        ctx.translate(x, FLOOR);
        ctx.scale(dir, 1);
        const bob = 1 + Math.sin(el * 26) * .04;
        // Painted, not screened: the crest keeps its own colour on a bright stage too.
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * .4;
        ctx.drawImage(lip, -wid * .98, -hgt * .72, wid * .86, hgt * .72);
        ctx.globalAlpha = a * .92;
        ctx.drawImage(lip, -wid * .8, -hgt * bob, wid, hgt * bob);
        ctx.restore();
      }
      for (let i = 0, m = count(8, liteFx); i < m; i++) {
        const q = cycle(el, 3.2, i, 71 + n);
        ctx.globalAlpha = a * (1 - q);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#fff3cf';
        sparkle(ctx, x - dir * (q * 110 + hash(i, 72) * 30), FLOOR - hgt * (.85 - q * .35) - Math.sin(q * Math.PI) * 34, 3 + (1 - q) * 6);
      }
      break;
    }
    case 'toko-five': {
      // The one light splits into five — 真白, her, 七深, 筑紫, 瑠唯 — five soft shafts fanning out of one point above
      // her and sweeping away across the floor together, each with its own pool; a white bloom where they part.
      const reach = e.radius ?? 420;
      const k = ease(el / (e.max * .7));
      const a = Math.min(1, el / .06, e.life / .3);
      ctx.globalCompositeOperation = 'lighter';
      const topX = e.x + dir * 30;
      for (let i = 0; i < TOKO_FIVE.length; i++) {
        const lag = i * .06;
        const kk = clamp(k - lag, 0, 1) / (1 - lag);
        const foot = e.x + dir * (40 + kk * (reach - 40) * (.44 + i * .14));
        const rgb = FIVE_RGB[i];
        const sourceX = topX + dir * (i - 2) * 14;
        // Add energy at crossings instead of painting a later, darker colour over earlier light.
        ctx.globalAlpha = a * .3;
        drawShaft(ctx, rgb, sourceX, -20, foot, FLOOR, 120);
        ctx.globalAlpha = a * .12;
        pool(ctx, foot, 56, rgb);
      }
      if (el < .3) {
        ctx.globalAlpha = (1 - el / .3) * .08;
        glow(ctx, topX, 40, 70 + el * 100, WARM_RGB);
      }
      for (let i = 0, m = count(10, liteFx); i < m; i++) {
        const q = cycle(el, 1.6, i, 91);
        ctx.globalAlpha = a * Math.sin(q * Math.PI) * .9;
        ctx.fillStyle = TOKO_FIVE[i % TOKO_FIVE.length];
        sparkle(ctx, e.x + dir * (60 + hash(i, 92) * (reach - 60) * k), FLOOR - 20 - q * 150 - hash(i, 93) * 60, 4 + hash(i, 94) * 5);
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

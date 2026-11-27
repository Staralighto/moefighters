import type { Effect, Projectile } from '../game/game.ts';
import type { Fighter } from '../game/fighter.ts';
import { FLOOR, H, W } from '../game/constants.ts';
import { TAU, cycle, dot, easeOut, glow, hash, sparkle, streak, tri } from './fxParticles.ts';

/* 海老冢智 — 辛辣压制 + 爬宠控场型 (perf-minded: baked offscreen stamps + zero per-frame gradients/allocs).
   - U 拿去吃掉！: baked layered choux cream puff with squash-and-stretch bounce, paper doily, sugar trail,
     heart-spark eat burst, and cream-splat + orbiting mini puffs for 混乱.
   - I 少主，上！: spotted leopard gecko 千代丸 on her shoulder with wagging tail & heal sparks, pale snake 少主
     with S-curve saddle spots & forked tongue, twin-fang bite flash, and double-loop ankle coil for 定身.
   - O 给我重练！: 148cm hop spring rings + comic 💢 anger-vein pop, spiky manga-burst scold wave, and
     sharp [ × ] silence reticle.
   - L 心象的分形: baked synth-night vignette & perspective grid, 7-bar keyboard equalizer, piano-key floor pads
     with fractal diamond beams, and shattering fractal crystal shards.
   Every save() pairs with restore(); all radii stay non-negative; lite mode halves particles & skips extras. */

export const TOMO_SCREEN_BACK: readonly string[] = ['tomo-night'];
export const TOMO_BACK: readonly string[] = ['tomo-gecko', 'tomo-pillar'];

const PINK = '#E34D8D';
const PINK_SOFT = '#ff9ec8';
const PINK_RGB = '227,77,141';
const CREAM = '#fff5d2';
const CRUST = '#e8a84b';
const CRUST_DARK = '#b87624';
const SNAKE_LIGHT = '#f2ede2';
const SNAKE_MARK = '#8d7f74';
const GECKO_GOLD = '#f4cb66';
const GECKO_SPOT = '#56423a';
const MIN_ALPHA = .02;
const COIL_LOOPS = [[-10, 26], [-22, 22]] as const;
const HOP_STREAKS = [-26, 26] as const;

const count = (full: number, lite: boolean) => lite ? Math.ceil(full / 2) : full;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  return g ? [c, g] : null;
}

/* ---- baked textures: painted once per page, then stamped with drawImage ---- */

const PUFF_PX = 64;
let puffTex: HTMLCanvasElement | null | undefined;
function puffStamp(): HTMLCanvasElement | null {
  if (puffTex !== undefined) return puffTex;
  const made = canvas(PUFF_PX, PUFF_PX);
  if (!made) return puffTex = null;
  const [c, g] = made;
  const m = PUFF_PX / 2, r = 24;
  // Dark pastry outline.
  g.fillStyle = '#5c3812';
  g.beginPath(); g.ellipse(m, m + 1, r + 1.5, r * .76 + 1.5, 0, 0, TAU); g.fill();
  // Bottom crust cup.
  g.fillStyle = CRUST_DARK;
  g.beginPath(); g.ellipse(m, m + 5, r * .94, r * .52, 0, 0, TAU); g.fill();
  // Scalloped whipped cream band.
  g.fillStyle = CREAM;
  for (let i = -3; i <= 3; i++) {
    g.beginPath(); g.arc(m + i * 5.8, m + 1.5 + (Math.abs(i) % 2) * 1.2, 5.2, 0, TAU); g.fill();
  }
  // Golden domed choux top.
  g.fillStyle = CRUST;
  g.beginPath(); g.ellipse(m, m - 4, r * .9, r * .52, 0, Math.PI, TAU); g.closePath(); g.fill();
  // Crispy ridge highlights & powdered sugar dusting.
  g.strokeStyle = '#f8cb7e';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath(); g.arc(m - 2, m - 4, r * .58, Math.PI * 1.15, Math.PI * 1.75); g.stroke();
  g.fillStyle = '#ffffff';
  g.globalAlpha = .82;
  g.beginPath(); g.ellipse(m - 5, m - 10, 8, 3.2, -.2, 0, TAU); g.fill();
  g.globalAlpha = .9;
  g.beginPath(); g.arc(m + 6, m - 9, 1.5, 0, TAU); g.fill();
  g.beginPath(); g.arc(m + 10, m - 6, 1.1, 0, TAU); g.fill();
  return puffTex = c;
}

const FRACTAL_PX = 96;
let fractalTex: HTMLCanvasElement | null | undefined;
function fractalStamp(): HTMLCanvasElement | null {
  if (fractalTex !== undefined) return fractalTex;
  const made = canvas(FRACTAL_PX, FRACTAL_PX);
  if (!made) return fractalTex = null;
  const [c, g] = made;
  const m = FRACTAL_PX / 2;
  const gr = g.createRadialGradient(m, m, 2, m, m, m - 2);
  gr.addColorStop(0, `rgba(${PINK_RGB},.45)`);
  gr.addColorStop(.55, `rgba(${PINK_RGB},.14)`);
  gr.addColorStop(1, `rgba(${PINK_RGB},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, FRACTAL_PX, FRACTAL_PX);
  const poly = (rad: number, rot: number, lw: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      const px = m + Math.cos(a) * rad, py = m + Math.sin(a) * rad;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    g.stroke();
  };
  poly(m - 6, 0, 2.5, PINK);
  poly((m - 6) * .68, Math.PI / 4, 2, PINK_SOFT);
  poly((m - 6) * .4, 0, 1.6, '#ffffff');
  return fractalTex = c;
}

const NIGHT_W = 256, NIGHT_H = 144;
let nightTex: HTMLCanvasElement | null | undefined;
function nightStamp(): HTMLCanvasElement | null {
  if (nightTex !== undefined) return nightTex;
  const made = canvas(NIGHT_W, NIGHT_H);
  if (!made) return nightTex = null;
  const [c, g] = made;
  g.fillStyle = 'rgba(11,5,22,.74)';
  g.fillRect(0, 0, NIGHT_W, NIGHT_H);
  const v = g.createRadialGradient(NIGHT_W * .5, NIGHT_H * .45, NIGHT_H * .1, NIGHT_W * .5, NIGHT_H * .5, NIGHT_W * .65);
  v.addColorStop(0, `rgba(${PINK_RGB},.12)`);
  v.addColorStop(.6, 'rgba(14,6,26,.18)');
  v.addColorStop(1, 'rgba(5,2,10,.65)');
  g.fillStyle = v;
  g.fillRect(0, 0, NIGHT_W, NIGHT_H);
  return nightTex = c;
}

const PILLAR_W = 96, PILLAR_H = 256;
let pillarTex: HTMLCanvasElement | null | undefined;
/** Tapered prism beam: soft radial base flare + needle spire fading smoothly to alpha 0 at the top. */
function pillarStamp(): HTMLCanvasElement | null {
  if (pillarTex !== undefined) return pillarTex;
  const made = canvas(PILLAR_W, PILLAR_H);
  if (!made) return pillarTex = null;
  const [c, g] = made;
  const cx = PILLAR_W / 2;
  // Soft horizontal rose aura.
  const hAura = g.createLinearGradient(0, 0, PILLAR_W, 0);
  hAura.addColorStop(0, `rgba(${PINK_RGB},0)`);
  hAura.addColorStop(.28, `rgba(${PINK_RGB},.28)`);
  hAura.addColorStop(.5, `rgba(${PINK_RGB},.85)`);
  hAura.addColorStop(.72, `rgba(${PINK_RGB},.28)`);
  hAura.addColorStop(1, `rgba(${PINK_RGB},0)`);
  g.fillStyle = hAura;
  g.fillRect(0, 0, PILLAR_W, PILLAR_H);
  // Tapered rose prism spire (wide at base, sharp needle at top).
  g.fillStyle = `rgba(${PINK_RGB},.85)`;
  g.beginPath();
  g.moveTo(cx - 18, PILLAR_H);
  g.lineTo(cx - 1.5, 16);
  g.lineTo(cx + 1.5, 16);
  g.lineTo(cx + 18, PILLAR_H);
  g.closePath();
  g.fill();
  // White-hot needle core.
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.beginPath();
  g.moveTo(cx - 7, PILLAR_H);
  g.lineTo(cx - .8, 32);
  g.lineTo(cx + .8, 32);
  g.lineTo(cx + 7, PILLAR_H);
  g.closePath();
  g.fill();
  // Smooth vertical fade: bright at bottom, dissolving smoothly into nothing toward the top.
  g.globalCompositeOperation = 'destination-in';
  const vFade = g.createLinearGradient(0, 0, 0, PILLAR_H);
  vFade.addColorStop(0, 'rgba(0,0,0,0)');
  vFade.addColorStop(.28, 'rgba(0,0,0,.35)');
  vFade.addColorStop(.68, 'rgba(0,0,0,.95)');
  vFade.addColorStop(.95, 'rgba(0,0,0,1)');
  vFade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vFade;
  g.fillRect(0, 0, PILLAR_W, PILLAR_H);
  return pillarTex = c;
}

function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, sx: number, sy: number): void {
  if (!(r > 0)) return;
  const tex = puffStamp();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  if (tex) {
    const d = r * (PUFF_PX / 24);
    ctx.drawImage(tex, -d / 2, -d / 2, d, d);
  } else {
    ctx.fillStyle = CRUST_DARK;
    ctx.beginPath(); ctx.ellipse(0, r * .2, r * .92, r * .52, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.beginPath(); ctx.ellipse(0, 0, r * .96, r * .34, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CRUST;
    ctx.beginPath(); ctx.ellipse(0, -r * .2, r * .88, r * .52, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawDiamondStroke(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  if (!(rx > 0) || !(ry > 0)) return;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  ctx.beginPath();
  ctx.moveTo(x + rx * cs, y + rx * sn);
  ctx.lineTo(x - ry * sn, y + ry * cs);
  ctx.lineTo(x - rx * cs, y - rx * sn);
  ctx.lineTo(x + ry * sn, y - ry * cs);
  ctx.closePath();
  ctx.stroke();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return;
  ctx.beginPath();
  ctx.moveTo(x, y + r * .85);
  ctx.bezierCurveTo(x - r * 1.2, y + r * .1, x - r * .95, y - r * .85, x, y - r * .28);
  ctx.bezierCurveTo(x + r * .95, y - r * .85, x + r * 1.2, y + r * .1, x, y + r * .85);
  ctx.fill();
}

/* ---- U 拿去吃掉！ (cream puff shot + cream confuse mark) ---- */

export function drawTomoShot(ctx: CanvasRenderingContext2D, p: Projectile, lite: boolean): boolean {
  if (p.fx === 'tomo-puff') {
    const bob = p.settled ? Math.sin(p.age * 7) * 1.5 : 0;
    const py = p.settled ? FLOOR - 12 + bob : p.y;
    const dir = p.face ?? 1;
    const bounceSquash = !p.settled && (p.wave ?? 0) > 0 && p.vy < -240 ? Math.max(0, (-p.vy - 240) / 110) : 0;
    const sx = p.settled ? 1.14 : 1 + bounceSquash * .22;
    const sy = p.settled ? .76 : 1 - bounceSquash * .22;
    const rot = p.settled ? 0 : p.age * 8 * dir;
    ctx.save();
    if (p.settled) {
      // Crisp white paper doily underneath the dropped puff.
      ctx.fillStyle = '#fffaf0';
      ctx.globalAlpha = .88;
      ctx.beginPath(); ctx.ellipse(p.x, FLOOR - 2, 22, 5.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e8d7b8';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (!lite) {
      // Golden pastry-crumb trail computed statelessly along velocity.
      const spd = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / spd, uy = p.vy / spd;
      for (let i = 1; i <= 5; i++) {
        const back = i * 9;
        const j = (hash(i, 41) - .5) * 10;
        ctx.globalAlpha = (1 - i / 6) * .72;
        ctx.fillStyle = i % 2 ? CREAM : CRUST;
        dot(ctx, p.x - ux * back - uy * j, py - uy * back + ux * j, 3.2 - i * .4);
      }
    }
    if (!lite) {
      ctx.globalAlpha = p.settled ? .32 : .24;
      glow(ctx, p.x, py, 26, '255,214,135');
    }
    ctx.globalAlpha = 1;
    drawPuff(ctx, p.x, py, 16, rot, sx, sy);
    if (p.settled) {
      const pulse = .55 + .45 * Math.sin(p.age * 8);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = PINK_SOFT;
      drawHeart(ctx, p.x + Math.sin(p.age * 4) * 3, py - 24 - pulse * 3, 4.5);
      if (!lite) {
        ctx.fillStyle = '#fff9de';
        sparkle(ctx, p.x - 12, py - 18, 4.5);
      }
    }
    ctx.restore();
    return true;
  }
  if (p.fx === 'tomo-snake') {
    const dir = p.face ?? 1;
    const ph = p.age * 18;
    ctx.save();
    ctx.translate(p.x, FLOOR - 6);
    ctx.scale(dir, 1);
    if (!lite) {
      // Tiny floor dust puffs kicked up behind the slithering tail.
      ctx.fillStyle = '#d7cfc4';
      for (let i = 0; i < 3; i++) {
        const u = cycle(p.age, 3.5, i, 5);
        ctx.globalAlpha = (1 - u) * .45;
        dot(ctx, -40 - u * 24, 3 - u * 8, 2.8 * (1 - u * .5));
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Tapered body outline + creamy scales.
    ctx.strokeStyle = '#302824';
    ctx.lineWidth = 10.5;
    ctx.beginPath();
    ctx.moveTo(-46, Math.sin(ph + 1.2) * 3);
    for (let x = -34; x <= 14; x += 8) ctx.lineTo(x, Math.sin(ph - x * .18) * 5 - 2);
    ctx.stroke();
    ctx.strokeStyle = SNAKE_LIGHT;
    ctx.lineWidth = 7;
    ctx.stroke();
    // Saddle markings along the back.
    ctx.fillStyle = SNAKE_MARK;
    for (let x = -34; x <= 8; x += 10) {
      dot(ctx, x, Math.sin(ph - x * .18) * 5 - 2, 2.2);
    }
    // Raised alert head + glossy eye + forked pink tongue.
    const hy = Math.sin(ph - 2.6) * 2.5 - 7;
    ctx.fillStyle = SNAKE_LIGHT;
    ctx.strokeStyle = '#302824';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(19, hy, 8.5, 5.5, -.1, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#24181b';
    dot(ctx, 21.5, hy - 1.5, 1.8);
    ctx.fillStyle = '#ffffff';
    dot(ctx, 22, hy - 2.1, .7);
    if (Math.sin(p.age * 26) > -.15) {
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 1.5;
      streak(ctx, 27, hy + .5, 34, hy, 1.4);
      streak(ctx, 34, hy, 38, hy - 2.5, 1.1);
      streak(ctx, 34, hy, 38, hy + 2.5, 1.1);
    }
    ctx.restore();
    return true;
  }
  return false;
}

export function auraTomoCream(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number, lite: boolean): void {
  if (!(h > 0)) return;
  const k = Math.min(1, left / .25);
  if (k <= MIN_ALPHA) return;
  const cx = f.x, cy = f.y - h * .82;
  ctx.save();
  ctx.globalAlpha = k * .92;
  // Whipped cream splatters stuck on cheek & forehead.
  ctx.fillStyle = CREAM;
  dot(ctx, cx - 8, cy + 5, 5.8);
  dot(ctx, cx + 9, cy - 1, 4.8);
  dot(ctx, cx + 1, cy + 10, 3.6);
  // Orbiting mini cream puffs + dazed pink/gold stars.
  for (let i = 0, m = count(3, lite); i < m; i++) {
    const a = t * 4.8 + (i / m) * TAU;
    const ox = cx + Math.cos(a) * 22;
    const oy = cy - 18 + Math.sin(a) * 6.5;
    if (i === 0) drawPuff(ctx, ox, oy, 6.5, a, 1, 1);
    else {
      ctx.fillStyle = i % 2 ? PINK : '#ffe082';
      sparkle(ctx, ox, oy, 5.2);
    }
  }
  ctx.restore();
}
export function applyTomoCream(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  const k = Math.max(0, 1 - age / .38);
  const rBase = easeOut(age / .38);
  ctx.save();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + hash(i, 11) * .35;
    const r = 10 + rBase * (28 + hash(i, 12) * 16);
    ctx.globalAlpha = k * .9;
    ctx.fillStyle = i % 3 === 0 ? CRUST : CREAM;
    dot(ctx, e.x + Math.cos(a) * r, e.y - 130 + Math.sin(a) * r * .72, 4.8 * k + 1.5);
  }
  ctx.restore();
}

export function auraTomoHush(ctx: CanvasRenderingContext2D, f: Fighter, h: number, left: number, t: number): void {
  if (!(h > 0)) return;
  const k = Math.min(1, left / .25);
  if (k <= MIN_ALPHA) return;
  const cx = f.x, cy = f.y - h - 20 + Math.sin(t * 5) * 2;
  const b = 12 + Math.sin(t * 9) * 1.2;
  ctx.save();
  ctx.globalAlpha = k * .94;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  // Sharp [ × ] silence reticle.
  streak(ctx, cx - 7, cy - 7, cx + 7, cy + 7, 2.8);
  streak(ctx, cx + 7, cy - 7, cx - 7, cy + 7, 2.8);
  ctx.beginPath();
  ctx.moveTo(cx - b + 4, cy - b); ctx.lineTo(cx - b, cy - b); ctx.lineTo(cx - b, cy + b); ctx.lineTo(cx - b + 4, cy + b);
  ctx.moveTo(cx + b - 4, cy - b); ctx.lineTo(cx + b, cy - b); ctx.lineTo(cx + b, cy + b); ctx.lineTo(cx + b - 4, cy + b);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  streak(ctx, cx - 5.5, cy - 5.5, cx + 5.5, cy + 5.5, 1.2);
  streak(ctx, cx + 5.5, cy - 5.5, cx - 5.5, cy + 5.5, 1.2);
  ctx.restore();
}
export function applyTomoHush(ctx: CanvasRenderingContext2D, e: Effect, age: number): void {
  const k = Math.max(0, 1 - age / .36);
  const r = 12 + easeOut(age / .36) * 28;
  ctx.save();
  ctx.globalAlpha = k * .92;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 3.2;
  drawDiamondStroke(ctx, e.x, e.y - 135, r, r, age * 3);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  drawDiamondStroke(ctx, e.x, e.y - 135, r * .62, r * .62, -age * 3);
  ctx.restore();
}

/* ---- world & screen effects ---- */

export function drawTomoFx(ctx: CanvasRenderingContext2D, e: Effect, lite: boolean): boolean {
  if (!(e.max > 0) || !(e.life > 0)) {
    return e.type.startsWith('tomo-');
  }
  const el = Math.max(0, e.max - e.life);
  if (e.type === 'tomo-puff-bounce' || e.type === 'tomo-puff-pop') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const burst = easeOut(el / .26);
    ctx.save();
    if (e.type === 'tomo-puff-pop' && !lite) {
      ctx.globalAlpha = k * .4;
      glow(ctx, e.x, e.y, 34, '255,222,150');
    }
    for (let i = 0, m = count(e.type === 'tomo-puff-pop' ? 12 : 7, lite); i < m; i++) {
      const a = -Math.PI * (.1 + hash(i, 3) * .8);
      const r = (10 + hash(i, 4) * 34) * burst;
      ctx.globalAlpha = k * .92;
      ctx.fillStyle = i % 3 === 0 ? CRUST : i % 3 === 1 ? CREAM : PINK_SOFT;
      dot(ctx, e.x + Math.cos(a) * r * (hash(i, 5) > .5 ? 1 : -1), e.y + Math.sin(a) * r, 3.8 * k + 1.4);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-puff-eat') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    ctx.save();
    ctx.globalAlpha = k * .68;
    glow(ctx, e.x, e.y, 44, '255,214,140');
    ctx.globalAlpha = k * .95;
    ctx.fillStyle = PINK_SOFT;
    drawHeart(ctx, e.x, e.y - 16 - el * 38, 7 * (.7 + .3 * k));
    for (let i = 0, m = count(6, lite); i < m; i++) {
      ctx.globalAlpha = k * .9;
      ctx.fillStyle = i % 2 ? PINK : '#fff3b8';
      sparkle(ctx, e.x + (hash(i, 7) - .5) * 48, e.y - 10 - el * 48 - hash(i, 8) * 22, 5.5 * k + 1.5);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-gecko') {
    const dir = e.dir ?? 1, h = e.radius ?? 181;
    const k = easeOut(el / .15) * Math.min(1, e.life / .2);
    if (k <= MIN_ALPHA) return true;
    const gx = e.x - dir * 13, gy = e.y - h * .73 + Math.sin(el * 10) * 1.4;
    const wag = Math.sin(el * 14) * .25;
    ctx.save();
    ctx.globalAlpha = k * .35;
    glow(ctx, e.x, e.y - h * .55, 68, PINK_RGB);
    // 千代丸: spotted golden leopard gecko perched near her shoulder.
    ctx.globalAlpha = k;
    ctx.translate(gx, gy);
    ctx.scale(dir, 1);
    // Plump wagging tail.
    ctx.fillStyle = GECKO_GOLD;
    ctx.strokeStyle = '#302420';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(-14, 2 + wag * 4, 7.5, 3.6, .28 + wag, 0, TAU); ctx.fill(); ctx.stroke();
    // Little legs.
    ctx.strokeStyle = GECKO_GOLD;
    ctx.lineWidth = 2.6;
    streak(ctx, -4, 4, -7, 8, 2.4);
    streak(ctx, 5, 3, 7, 7, 2.4);
    // Body + round gecko head.
    ctx.fillStyle = GECKO_GOLD;
    ctx.strokeStyle = '#302420';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 11.5, 5.6, -.12, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(11, -2.5, 5.5, 4.4, -.1, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GECKO_SPOT;
    dot(ctx, -4, -.5, 1.5);
    dot(ctx, 2, -1.8, 1.6);
    dot(ctx, -12, 2 + wag * 4, 1.3);
    ctx.fillStyle = '#1b1412';
    dot(ctx, 13, -3.5, 1.4);
    ctx.restore();
    // Warm rising heart-sparks (「心情变好」).
    ctx.save();
    for (let i = 0, m = count(5, lite); i < m; i++) {
      const u = cycle(el, 1.6, i, 12);
      const hx = e.x + (hash(i, 13) - .5) * 48;
      const hy = e.y - h * (.4 + u * .5);
      ctx.globalAlpha = k * Math.sin(u * Math.PI) * .88;
      ctx.fillStyle = i === 0 ? PINK_SOFT : i % 2 ? '#ffe08a' : PINK;
      if (i === 0) drawHeart(ctx, hx, hy, 4.2);
      else sparkle(ctx, hx, hy, 5);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-snake-bite') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const r = 10 + easeOut(el / .22) * 26;
    ctx.save();
    ctx.globalAlpha = k * .95;
    // Twin fang arc flashes.
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * .65, -2.2, -.95); ctx.stroke();
    ctx.beginPath(); ctx.arc(e.x, e.y, r * .65, .95, 2.2); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      streak(ctx, e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 2);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-snake-coil') {
    const k = Math.min(1, e.life / .2);
    if (k <= MIN_ALPHA) return true;
    ctx.save();
    ctx.globalAlpha = k * .94;
    // Two stacked ankle loops wrapping around the rooted target.
    for (const [oy, rx] of COIL_LOOPS) {
      ctx.strokeStyle = '#302824';
      ctx.lineWidth = 8.5;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + oy, rx, 7.5, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = SNAKE_LIGHT;
      ctx.lineWidth = 5.2;
      ctx.stroke();
    }
    ctx.fillStyle = SNAKE_MARK;
    for (let i = 0; i < 4; i++) {
      const a = el * 3 + (i / 4) * TAU;
      dot(ctx, e.x + Math.cos(a) * 24, e.y - 10 + Math.sin(a) * 7, 2);
    }
    // 少主's little head peeking out in front, flicking its tongue.
    const hx = e.x + (e.dir ?? 1) * 22, hy = e.y - 25;
    ctx.fillStyle = SNAKE_LIGHT;
    ctx.strokeStyle = '#302824';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(hx, hy, 6.5, 4.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#24181b';
    dot(ctx, hx + (e.dir ?? 1) * 2, hy - 1, 1.3);
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-hop') {
    const h = e.radius ?? 181;
    const k = Math.sin(Math.min(1, el / .48) * Math.PI) * Math.min(1, e.life / .15);
    if (k <= MIN_ALPHA) return true;
    const dir = e.dir ?? 1;
    ctx.save();
    // Upward hop spring ring & vertical speed streaks.
    ctx.globalAlpha = k * .82;
    ctx.strokeStyle = PINK_SOFT;
    ctx.lineWidth = 2.2;
    const rx = Math.max(2, 16 + el * 40), ry = Math.max(1, rx * .28);
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = PINK;
    for (const ox of HOP_STREAKS) {
      streak(ctx, e.x + ox, e.y - h * .18, e.x + ox, e.y - h * .56, 2.2);
    }
    // Comic 💢 anger-vein pop beside her head (4 small arcs).
    const vx = e.x + dir * 24, vy = e.y - h * .96;
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(vx - 4, vy - 4, 3.5, 0, Math.PI * .5); ctx.stroke();
    ctx.beginPath(); ctx.arc(vx + 4, vy - 4, 3.5, Math.PI * .5, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(vx + 4, vy + 4, 3.5, Math.PI, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(vx - 4, vy + 4, 3.5, Math.PI * 1.5, TAU); ctx.stroke();
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-scold') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const r = Math.max(2, (e.radius ?? 180) * easeOut(el / .24));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .48;
    glow(ctx, e.x, e.y, r * .65, PINK_RGB);
    // Comic spiky speech-burst polygon.
    ctx.globalAlpha = k * .92;
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    const spikes = 14;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * TAU + .1;
      const rad = i % 2 === 0 ? r * 1.04 : r * .76;
      const px = e.x + Math.cos(a) * rad, py = e.y + Math.sin(a) * rad * .66;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(e.x, e.y, r * .72, r * .46, 0, 0, TAU); ctx.stroke();
    // Sharp rose/white needle bursts.
    for (let i = 0, m = count(12, lite); i < m; i++) {
      const a = (i / m) * TAU + .2;
      const r0 = r * .45, r1 = r * (.9 + hash(i, 21) * .25);
      ctx.strokeStyle = i % 2 ? '#ffffff' : PINK;
      streak(ctx, e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * .66, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1 * .66, 2.2);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-night') {
    const into = easeOut(el / .22), out = Math.min(1, e.life / .3);
    const k = into * out;
    if (k <= MIN_ALPHA) return true;
    const tex = nightStamp();
    ctx.save();
    ctx.globalAlpha = k * .88;
    if (tex) ctx.drawImage(tex, 0, 0, W, H);
    else {
      ctx.fillStyle = '#0e0718';
      ctx.fillRect(0, 0, W, H);
    }
    // Perspective synth grid + rising background triangles (skipped on lite).
    if (!lite) {
      ctx.globalAlpha = k * .16;
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 1;
      for (let gx = 80; gx < W; gx += 120) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, FLOOR); ctx.stroke();
      }
      for (let gy = 80; gy < FLOOR; gy += 90) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const u = cycle(el, .45, i, 33);
        ctx.globalAlpha = k * Math.sin(u * Math.PI) * .24;
        ctx.fillStyle = i % 2 ? PINK : PINK_SOFT;
        tri(ctx, hash(i, 34) * W, FLOOR - u * 340, 7 + hash(i, 35) * 6, el * 1.6 + i);
      }
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-keys-glow') {
    const k = easeOut(el / .18) * Math.min(1, e.life / .2);
    if (k <= MIN_ALPHA) return true;
    const ftex = fractalStamp();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .42;
    glow(ctx, e.x, e.y, 46, PINK_RGB);
    if (ftex) {
      const sz = 52 + Math.sin(el * 12) * 4;
      ctx.globalAlpha = k * .78;
      ctx.translate(e.x, e.y + 4);
      ctx.rotate(el * 1.4);
      ctx.drawImage(ftex, -sz / 2, -sz / 2, sz, sz);
      ctx.rotate(-el * 1.4);
      ctx.translate(-e.x, -(e.y + 4));
    }
    // 7 sleek synth equalizer bars hovering gently just above the Nord keys.
    for (let i = -3; i <= 3; i++) {
      const bh = 4 + Math.abs(Math.sin(el * 18 + i * .9)) * 13;
      const bx = e.x + i * 6 - 1.5;
      const by = e.y - 10 - bh;
      ctx.globalAlpha = k * .65;
      ctx.fillStyle = PINK;
      ctx.fillRect(bx, by, 3, bh);
      ctx.globalAlpha = k * .92;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, 3, 2.2);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-pillar') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const rise = easeOut(el / .12);
    const tier = e.n ?? 0;
    const h = (265 + tier * 24) * rise;
    const w = 44 + tier * 5;
    const ftex = fractalStamp();
    const ptex = pillarStamp();
    ctx.save();
    // Soft floor synth ring + glowing piano-key dashes at the base.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .45;
    glow(ctx, e.x, FLOOR - 4, 34 + tier * 3, PINK_RGB);
    ctx.globalAlpha = k * .82;
    ctx.strokeStyle = PINK_SOFT;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(e.x, FLOOR - 2, 24 + tier * 2, 5.5, 0, 0, TAU); ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      const keyW = 5;
      ctx.fillStyle = (i + 2) % 2 === 0 ? '#ffffff' : PINK;
      ctx.globalAlpha = k * ((i + 2) % 2 === 0 ? .88 : .65);
      ctx.fillRect(e.x + i * 7.5 - keyW / 2, FLOOR - 4.5, keyW, 3);
    }
    // Tapered prism beam (soft edges + needle tip fading to zero at top).
    if (ptex) {
      ctx.globalAlpha = k * .92;
      ctx.drawImage(ptex, e.x - w, FLOOR - h, w * 2, h);
    } else {
      // Headless fallback: tapered triangle spire instead of a flat rectangle.
      ctx.globalAlpha = k * .8;
      ctx.fillStyle = PINK;
      ctx.beginPath();
      ctx.moveTo(e.x - w * .35, FLOOR); ctx.lineTo(e.x, FLOOR - h); ctx.lineTo(e.x + w * .35, FLOOR);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(e.x - w * .12, FLOOR); ctx.lineTo(e.x, FLOOR - h * .85); ctx.lineTo(e.x + w * .12, FLOOR);
      ctx.closePath(); ctx.fill();
    }
    // Nested self-similar fractal diamonds stamped along the spire.
    const stamps = lite ? 1 : Math.min(3, 1 + Math.floor(tier / 2));
    for (let s = 0; s < stamps; s++) {
      const sy = FLOOR - h * (.22 + s * .22);
      const sz = (36 + tier * 4) * (1 - s * .22);
      ctx.globalAlpha = k * .88;
      if (ftex) {
        ctx.translate(e.x, sy);
        ctx.rotate((s % 2 ? -1 : 1) * el * 2.2);
        ctx.drawImage(ftex, -sz / 2, -sz / 2, sz, sz);
        ctx.rotate(-(s % 2 ? -1 : 1) * el * 2.2);
        ctx.translate(-e.x, -sy);
      } else {
        ctx.strokeStyle = '#ffd4e8';
        ctx.lineWidth = 2;
        drawDiamondStroke(ctx, e.x, sy, sz * .4, sz * .4, 0);
      }
    }
    // Escaping light flecks dissolving off the top of the spire.
    for (let i = 0, m = count(3, lite); i < m; i++) {
      const sy = FLOOR - h * (.62 + i * .16) - el * 45;
      const sx = e.x + (hash(i + tier * 7, 51) - .5) * 20;
      ctx.globalAlpha = k * .82;
      ctx.fillStyle = i % 2 ? '#ffffff' : PINK_SOFT;
      sparkle(ctx, sx, sy, 4.5 * k + 1.5);
    }
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-shard') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const r = 16 + easeOut(el / .18) * 30;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .95;
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.4;
    drawDiamondStroke(ctx, e.x, e.y, r, r * .6, (e.n ?? 0) * .5 + el * 4);
    ctx.fillStyle = '#ffffff';
    tri(ctx, e.x, e.y, 7 * k + 2, -el * 6);
    ctx.restore();
    return true;
  }
  if (e.type === 'tomo-crystal') {
    const k = Math.max(0, e.life / e.max);
    if (k <= MIN_ALPHA) return true;
    const burst = easeOut(el / .2);
    const r = Math.max(2, (e.radius ?? 170) * burst);
    const ftex = fractalStamp();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * .58;
    glow(ctx, e.x, e.y, r, PINK_RGB);
    if (ftex) {
      ctx.globalAlpha = k * .92;
      const sz = r * 1.45;
      ctx.drawImage(ftex, e.x - sz / 2, e.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = k * .95;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.2;
    drawDiamondStroke(ctx, e.x, e.y, r * .55, r * .88, 0);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.4;
    drawDiamondStroke(ctx, e.x, e.y, r * .82, r * .5, Math.PI / 4);
    // Expanding shock ring + shattering glass-shard triangles.
    ctx.globalAlpha = k * .7;
    ctx.strokeStyle = PINK_SOFT;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x, e.y, r * .92, 0, TAU); ctx.stroke();
    for (let i = 0, m = count(14, lite); i < m; i++) {
      const a = (i / m) * TAU + hash(i, 31) * .35;
      const d = r * (.3 + .75 * easeOut(el / .36));
      const sx = e.x + Math.cos(a) * d, sy = e.y + Math.sin(a) * d * .82;
      ctx.fillStyle = i % 2 ? '#ffffff' : PINK;
      ctx.globalAlpha = k * .9;
      tri(ctx, sx, sy, 8 * k + 2.5, a + el * 6);
      if (!lite && i % 2 === 0) {
        ctx.strokeStyle = PINK_SOFT;
        streak(ctx, sx, sy, sx - Math.cos(a) * 18 * k, sy - Math.sin(a) * 18 * k, 1.5);
      }
    }
    ctx.restore();
    return true;
  }
  return false;
}

import { H, W } from '../game/constants.ts';
import { noteGlyph } from './fx.ts';
import type { FinaleFrame, FinaleLead } from './finale.ts';
import { PINK_METEOR } from './finaleAnon.ts';

/* 终幕 lead-ins, one per character, keyed by data.finale.fx. Each owns everything before her
   illustration and must land on the illustration's anchor (FinaleFrame.anchor) so the hand-off reads as
   one shot. Docs: docs/finale-sop.md. */

const ease = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** Fixed pseudo-random in [0,1) per integer: the picture must not draw from the match's random. */
const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/* ---------------- 丰川祥子 · 血月睁眼 ----------------
   v3 (2026-11-14): the upper arc of a huge blood moon, the camera turning clockwise with it while a few
   numerals of its clock surface; pull back to the whole moon; it sweeps to the top left onto the
   picture's own moon and breaks. */

const MOON_TEX = 256;
let moonTex: HTMLCanvasElement | null = null;
function bloodMoon(): HTMLCanvasElement {
  if (moonTex) return moonTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = MOON_TEX;
  const g = cv.getContext('2d')!;
  const R = MOON_TEX / 2;
  const body = g.createRadialGradient(R * .72, R * .7, R * .1, R, R, R);
  body.addColorStop(0, '#ff8a6e');
  body.addColorStop(.45, '#d6263a');
  body.addColorStop(.85, '#7a0a1e');
  body.addColorStop(1, '#3a0410');
  g.fillStyle = body;
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
  // Maria: soft darker blotches, fixed.
  g.save();
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 9; i++) {
    const x = R + (hash(i) - .5) * R * 1.3, y = R + (hash(i + 20) - .5) * R * 1.3, r = R * (.12 + hash(i + 40) * .22);
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, 'rgba(70,4,18,.42)');
    m.addColorStop(1, 'rgba(70,4,18,0)');
    g.fillStyle = m;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // Lit rim.
  const rim = g.createRadialGradient(R, R, R * .82, R, R, R);
  rim.addColorStop(0, 'rgba(255,190,170,0)');
  rim.addColorStop(1, 'rgba(255,190,170,.55)');
  g.fillStyle = rim;
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
  moonTex = cv;
  return cv;
}

const RING_TEX = 512;
let ringTex: HTMLCanvasElement | null = null;
const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
function clockRing(): HTMLCanvasElement {
  if (ringTex) return ringTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = RING_TEX;
  const g = cv.getContext('2d')!;
  const R = RING_TEX / 2;
  g.translate(R, R);
  g.strokeStyle = 'rgba(255,120,120,.75)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, R * .96, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, R * .78, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, long = i % 5 === 0;
    g.lineWidth = long ? 2.5 : 1;
    g.beginPath();
    g.moveTo(Math.sin(a) * R * .96, -Math.cos(a) * R * .96);
    g.lineTo(Math.sin(a) * R * (long ? .89 : .92), -Math.cos(a) * R * (long ? .89 : .92));
    g.stroke();
  }
  g.fillStyle = 'rgba(255,170,160,.9)';
  g.font = `600 ${Math.round(R * .085)}px "Times New Roman", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.save();
    g.translate(Math.sin(a) * R * .84, -Math.cos(a) * R * .84);
    g.rotate(a);
    g.fillText(ROMAN[i], 0, 0);
    g.restore();
  }
  ringTex = cv;
  return cv;
}

/** Glass over the whole frame, cut radially from the moon: rings of jittered wedges, the inner ones small. */
interface Shard { pts: [number, number][]; cx: number; cy: number; spin: number; speed: number; lift: number }
let glass: { key: string; shards: Shard[] } | null = null;
function frameGlass(ox: number, oy: number, lite: boolean): Shard[] {
  const key = `${ox | 0},${oy | 0},${lite}`;
  if (glass?.key === key) return glass.shards;
  const rings: [number, number][] = lite ? [[.16, 6], [.5, 9], [1.6, 10]] : [[.1, 6], [.28, 9], [.6, 12], [1.6, 14]];
  const out: Shard[] = [];
  let r0 = 0;
  rings.forEach(([rr, n], ri) => {
    const r1 = rr * W;
    const off = hash(ri * 31) * Math.PI * 2;
    const cuts = Array.from({ length: n }, (_, i) => off + (i + (hash(ri * 50 + i) - .5) * .55) / n * Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a0 = cuts[i], a1 = i + 1 < n ? cuts[i + 1] : cuts[0] + Math.PI * 2;
      const j0 = r0 * (1 + (hash(ri * 70 + i) - .5) * .25), j1 = r1 * (1 + (hash(ri * 90 + i) - .5) * .2);
      const pts: [number, number][] = r0 > 0
        ? [[ox + Math.cos(a0) * j0, oy + Math.sin(a0) * j0], [ox + Math.cos(a1) * j0, oy + Math.sin(a1) * j0]]
        : [[ox, oy]];
      pts.push([ox + Math.cos(a1) * j1, oy + Math.sin(a1) * j1], [ox + Math.cos(a0) * j1, oy + Math.sin(a0) * j1]);
      const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
      out.push({
        pts, cx: ox + Math.cos(am) * rm, cy: oy + Math.sin(am) * rm,
        spin: (hash(ri * 110 + i) - .5) * 3, speed: .7 + hash(ri * 130 + i) * .8, lift: .4 + hash(ri * 150 + i) * .9,
      });
    }
    r0 = r1;
  });
  glass = { key, shards: out };
  return out;
}

/** Jagged cracks from the centre, unit space; the long ones run out across the whole frame. */
let cracks: [number, number][][] | null = null;
function moonCracks(): [number, number][][] {
  if (cracks) return cracks;
  cracks = Array.from({ length: 10 }, (_, i) => {
    let a = i / 10 * Math.PI * 2 + hash(i + 300) * .5;
    const reach = i % 2 ? 1.05 : 3.4 + hash(i + 700) * 1.5;
    const line: [number, number][] = [[0, 0]];
    for (let s = 1; s <= 8; s++) {
      a += (hash(i * 10 + s + 400) - .5) * .5;
      const r = s / 8 * reach;
      line.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return line;
  });
  return cracks;
}

const CLOSE = .3;
const PULL = 1.45;
const MOVE = 1.9;
const CRACK = 2.15;
const BREAK = 2.35;
const DEG = Math.PI / 180;

const darkAll = (c: CanvasRenderingContext2D, a = 1): void => {
  c.save(); c.globalAlpha = a; c.fillStyle = '#050208'; c.fillRect(-W, -H, W * 3, H * 3); c.restore();
};
const easeInOut = (x: number): number => { const v = clamp01(x); return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };

/** The moon cut from her own picture, so the moon that breaks is the moon that stays. Null until the art
 *  has loaded (the drawn moon stands in). */
let artMoon: { art: HTMLImageElement; cv: HTMLCanvasElement } | null = null;
function pictureMoon(f: FinaleFrame): HTMLCanvasElement | null {
  const art = f.art, a = f.data.finale?.anchor;
  if (!art || !a) return null;
  if (artMoon?.art === art) return artMoon.cv;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const r = a.r * art.naturalHeight, sx = a.x * art.naturalWidth - r, sy = a.y * art.naturalHeight - r;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
  g.drawImage(art, sx, sy, r * 2, r * 2, 0, 0, S, S);
  artMoon = { art, cv };
  return cv;
}

/** A clock face round the moon: two hairline circles, sixty ticks, and the numerals, each with its own
 *  opacity so they can surface one at a time. Angles are clock angles (0 = XII, clockwise). */
function clockFace(c: CanvasRenderingContext2D, R: number, ringA: number, numA: (i: number) => number, lite: boolean): void {
  c.save();
  c.strokeStyle = `rgba(255,120,120,${(.7 * ringA).toFixed(3)})`;
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(0, 0, R * 1.32, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1;
  c.beginPath(); c.arc(0, 0, R * 1.07, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2, long = i % 5 === 0;
    const r0 = R * 1.32, r1 = R * (long ? 1.27 : 1.295);
    c.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); c.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
  }
  c.stroke();
  c.font = `600 ${Math.round(R * .13)}px "Times New Roman", serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const na = numA(i);
    if (na <= 0) continue;
    const a = i / 12 * Math.PI * 2;
    c.save();
    c.translate(Math.sin(a) * R * 1.19, -Math.cos(a) * R * 1.19);
    c.rotate(a);
    c.fillStyle = `rgba(255,190,185,${na.toFixed(3)})`;
    c.shadowColor = '#ff3048'; c.shadowBlur = lite ? 0 : 10 * na;
    c.fillText(ROMAN[i], 0, 0);
    c.restore();
  }
  c.restore();
}

/** Camera turn: the clock face's angle on screen, turning clockwise from the open through the pull-back. */
// Ends at exactly 0 when the moon lands, so it sits on the picture's moon the right way up.
const turn = (t: number): number => (-80 + 80 * easeInOut((t - CLOSE) / (CRACK - .02 - CLOSE))) * DEG;
/** The few numerals the close shot shows (XI, XII, I), surfacing as the turn carries each up the left of
 *  the arc and fading as it leaves on the right. */
const SHOWN = new Set([11, 0, 1]);

/** 血月 v3 (2026-11-14), slower and readable: the dark opens on the upper arc of a huge blood moon; the
 *  camera turns with it clockwise and the numerals round it surface one by one; the camera pulls back to
 *  the whole moon and its clock; the moon sweeps from the centre to the top left, onto her picture's own
 *  moon, cracks, and the whole frame breaks. Washes run into the letterbox. */
function bloodEye(f: FinaleFrame): void {
  const { c, t, lite, anchor } = f;
  if (t >= BREAK) { shatter(f); return; }
  darkAll(c, ease((t - .12) / .3));
  if (t < CLOSE) return;

  // Where the moon is and how big: low and huge for the close shot, centred for the pull-back, then
  // sweeping to the anchor.
  const pull = easeInOut((t - PULL) / (MOVE - PULL));
  let mx = W / 2, my = H * 1.25 + (H / 2 - H * 1.25) * pull;
  let R = H * .95 + (H * .3 - H * .95) * pull;
  const mv = easeInOut((t - MOVE) / (CRACK - MOVE - .02));
  mx += (anchor.x - mx) * mv; my += (anchor.y - my) * mv; R += (anchor.r - R) * mv;
  const shake = t > CRACK ? 3 * (hash(Math.floor(t * 60)) - .5) : 0;
  mx += shake; my += shake * .6;
  const rise = ease((t - CLOSE) / .5);

  // Motion trail while it sweeps.
  if (mv > 0 && mv < 1 && !lite) {
    for (let k = 3; k >= 1; k--) {
      const back = easeInOut((t - .03 * k - MOVE) / (CRACK - MOVE - .02));
      const gx = W / 2 + (anchor.x - W / 2) * back, gy = H / 2 + (anchor.y - H / 2) * back;
      const gr = H * .3 + (anchor.r - H * .3) * back;
      c.save(); c.globalAlpha = .18 / k; c.drawImage(pictureMoon(f) ?? bloodMoon(), gx - gr, gy - gr, gr * 2, gr * 2); c.restore();
    }
  }

  // Halo.
  c.save();
  c.globalCompositeOperation = 'lighter';
  // Tight in the close shot (the sky stays dark above the arc), wider once the whole moon is in view.
  const halo = c.createRadialGradient(mx, my, R * .98, mx, my, R * (1.25 + .95 * pull));
  halo.addColorStop(0, `rgba(255,50,64,${(rise * (.32 + .18 * pull)).toFixed(3)})`);
  halo.addColorStop(1, 'rgba(255,50,64,0)');
  c.fillStyle = halo;
  c.fillRect(-W, -H, W * 3, H * 3);
  c.restore();

  // The moon is the one cut from her picture all the way (the drawn one only stands in until the art
  // loads), so the moon that breaks is the moon that stays.
  // The camera circles the moon, so the moon turns with its clock face. It starts in the dark and lights
  // up as it turns: the close shot is a blow-up of a small picture, so it is kept dim and veiled until the
  // pull-back brings it to its own size.
  const ang0 = turn(t);
  const lit = ease((t - CLOSE) / (PULL + .25 - CLOSE));
  c.save();
  c.globalAlpha = rise;
  c.translate(mx, my);
  c.rotate(ang0);
  c.drawImage(pictureMoon(f) ?? bloodMoon(), -R, -R, R * 2, R * 2);
  c.restore();
  c.save();
  c.beginPath(); c.arc(mx, my, R + .5, 0, Math.PI * 2); c.clip();
  // Shadow over the disc, lifting as it turns.
  c.fillStyle = `rgba(6,1,6,${(.78 * (1 - lit)).toFixed(3)})`;
  c.fillRect(mx - R, my - R, R * 2, R * 2);
  // A soft red glow over the surface (hides the blow-up's softness), and a light that stays fixed on the
  // upper left while the moon turns beneath it, so the turn reads.
  c.globalCompositeOperation = 'lighter';
  const veil = c.createRadialGradient(mx, my, R * .2, mx, my, R);
  veil.addColorStop(0, `rgba(255,70,80,${(.22 * (1 - pull * .7) * rise).toFixed(3)})`);
  veil.addColorStop(1, `rgba(255,70,80,${(.08 * rise).toFixed(3)})`);
  c.fillStyle = veil;
  c.fillRect(mx - R, my - R, R * 2, R * 2);
  const lx = mx - R * .45, ly = my - R * .55;
  const sheen = c.createRadialGradient(lx, ly, 0, lx, ly, R * .9);
  sheen.addColorStop(0, `rgba(255,190,170,${(.3 * lit).toFixed(3)})`);
  sheen.addColorStop(1, 'rgba(255,190,170,0)');
  c.fillStyle = sheen;
  c.fillRect(mx - R, my - R, R * 2, R * 2);
  c.restore();
  // The lit rim, brightening with the light.
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = `rgba(255,150,140,${(.25 + .5 * lit).toFixed(3)})`;
  c.lineWidth = 2;
  c.shadowColor = '#ff3048'; c.shadowBlur = lite ? 0 : 16;
  c.beginPath(); c.arc(mx, my, R, 0, Math.PI * 2); c.stroke();
  c.restore();

  // The clock face turns with the camera. In the close shot only a few numerals surface; during the
  // pull-back the whole face comes up faintly; it thins away as the moon sweeps off.
  const ang = ang0;
  const faceA = rise * (1 - clamp01(mv * 1.6));
  if (faceA > 0) {
    c.save();
    c.translate(mx, my);
    c.rotate(ang);
    clockFace(c, R, faceA * (.45 + .3 * pull), i => {
      const screen = ((i / 12 * 360 + ang / DEG + 540) % 360) - 180;
      const close = SHOWN.has(i) ? clamp01((screen + 32) / 14) * (1 - clamp01((screen - 34) / 14)) : 0;
      return faceA * Math.max(close * (1 - pull * .5), pull * .55);
    }, lite);
    c.restore();
  }

  // Cracks race out of the moon across the whole frame.
  if (t > CRACK) {
    const q = ease((t - CRACK) / (BREAK - CRACK - .02));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = '#fff4e8';
    c.shadowColor = '#ff5a4a'; c.shadowBlur = lite ? 0 : 14;
    for (const line of moonCracks()) {
      const upto = q * (line.length - 1);
      const [ex, ey] = line[line.length - 1];
      c.lineWidth = ex * ex + ey * ey > 4 ? 1.6 : 2.4;
      c.beginPath();
      c.moveTo(mx, my);
      for (let i = 1; i < line.length && i - 1 < upto; i++) {
        const u = Math.min(1, upto - (i - 1));
        const [ax, ay] = line[i - 1], [bx, by] = line[i];
        c.lineTo(mx + (ax + (bx - ax) * u) * R, my + (ay + (by - ay) * u) * R);
      }
      c.stroke();
    }
    c.restore();
  }
}

/** The break: the lead-in's last picture, baked once, comes apart as glass; the illustration is already
 *  behind it. The storm ends here, so the glass does not fly: it drifts apart in slow motion, turning,
 *  catching the light now and then, and thins away while the picture lights up behind it. */
function shatter(f: FinaleFrame): void {
  const { c, t, lite, anchor } = f;
  const s = t - BREAK;
  const pic = f.bake('glass', g => bloodEye({ ...f, c: g, t: BREAK - .001 }));
  for (const sh of frameGlass(anchor.x, anchor.y, lite)) {
    // A quick first parting, then almost still.
    const k = .35 * ease(s / .25) + .65 * ease(s / 1.6);
    const alpha = (1 - clamp01((s - .15 * sh.lift) / 1.1)) * .92;
    if (alpha <= 0) continue;
    const dx = sh.cx - anchor.x, dy = sh.cy - anchor.y;
    const len = Math.hypot(dx, dy) || 1;
    const fly = k * (30 + len * .28) * sh.speed;
    const z = 1 + k * .22 * sh.lift;
    c.save();
    c.globalAlpha = alpha;
    c.translate(sh.cx + dx / len * fly, sh.cy + dy / len * fly + k * k * 18 * sh.lift);
    c.rotate(sh.spin * k * .5);
    c.scale(z, z);
    c.translate(-sh.cx, -sh.cy);
    c.beginPath();
    sh.pts.forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.save(); c.clip(); c.drawImage(pic, 0, 0, W, H); c.restore();
    // The edge catches the light as the piece turns.
    const catchLight = Math.pow(Math.abs(Math.sin(sh.spin * k * 3 + sh.cx * .01)), 6);
    c.strokeStyle = `rgba(255,232,224,${(.35 + .6 * catchLight).toFixed(3)})`;
    c.lineWidth = 1 + catchLight;
    c.stroke();
    c.restore();
  }
  // The shockwave and the flash.
  c.save();
  c.globalCompositeOperation = 'lighter';
  const ringR = anchor.r * (1 + s * 4);
  c.strokeStyle = `rgba(255,190,180,${(.6 * clamp01(1 - s / .5)).toFixed(3)})`;
  c.lineWidth = 5 * (1 - clamp01(s / .5)) + 1;
  c.beginPath(); c.arc(anchor.x, anchor.y, ringR, 0, Math.PI * 2); c.stroke();
  c.fillStyle = `rgba(255,215,205,${(.45 * clamp01(1 - s / .3)).toFixed(3)})`;
  c.fillRect(-W, -H, W * 3, H * 3);
  c.restore();
}

/** Moonlight over the held picture: a slow crown of rays from her moon, a breathing bloom, embers
 *  rising through the dark, a few petals, and the busy hem pulled down into shadow under the type. */
let rayTex: HTMLCanvasElement | null = null;
function moonRays(): HTMLCanvasElement {
  if (rayTex) return rayTex;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.translate(S / 2, S / 2);
  // Clear over the disc itself (the texture's radius is 5.5 moon radii): the rays start at the rim.
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
  rg.addColorStop(0, 'rgba(255,90,100,0)');
  rg.addColorStop(.17, 'rgba(255,90,100,0)');
  rg.addColorStop(.24, 'rgba(255,90,100,.5)');
  rg.addColorStop(1, 'rgba(255,90,100,0)');
  g.fillStyle = rg;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + hash(i + 2000) * .25, w = .03 + hash(i + 2050) * .05;
    g.moveTo(0, 0);
    g.arc(0, 0, S / 2 * (.7 + hash(i + 2100) * .3), a - w, a + w);
    g.closePath();
  }
  g.fill();
  rayTex = cv;
  return cv;
}

let floorGrad: { c: CanvasRenderingContext2D; g: CanvasGradient } | null = null;
function bloodOver(f: FinaleFrame): void {
  const { c, t, lite, anchor } = f;
  const s = t - (BREAK + .35);
  const breath = .85 + .15 * Math.sin(t * 2.4);
  c.save();
  c.globalCompositeOperation = 'lighter';
  // Rays.
  const rr = anchor.r * 5.5;
  c.globalAlpha = .3 * ease((s + .2) / 1.4);
  c.translate(anchor.x, anchor.y);
  c.rotate(t * .04);
  c.drawImage(moonRays(), -rr, -rr, rr * 2, rr * 2);
  c.restore();
  c.save();
  c.globalCompositeOperation = 'lighter';
  const bloom = c.createRadialGradient(anchor.x, anchor.y, anchor.r * .8, anchor.x, anchor.y, anchor.r * 2.1);
  bloom.addColorStop(0, `rgba(255,70,80,${(.24 * breath).toFixed(3)})`);
  bloom.addColorStop(1, 'rgba(255,70,80,0)');
  c.fillStyle = bloom;
  c.fillRect(0, 0, W, H);
  // Embers: soft red points rising, larger ones nearer and blurrier.
  const n = lite ? 10 : 26;
  for (let i = 0; i < n; i++) {
    const life = 3 + hash(i + 3000) * 2;
    const p = ((t + hash(i + 3100) * life) % life) / life;
    const x = W * hash(i + 3200) + Math.sin(t * 1.3 + i) * 14;
    const y = H * (1.05 - p * 1.1);
    const near = hash(i + 3300);
    const rad = 1.5 + near * near * 7;
    const eg = c.createRadialGradient(x, y, 0, x, y, rad);
    eg.addColorStop(0, `rgba(255,${120 + (near * 80) | 0},${120 + (near * 60) | 0},${(.7 * Math.sin(p * Math.PI) * (1 - near * .4)).toFixed(3)})`);
    eg.addColorStop(1, 'rgba(255,90,100,0)');
    c.fillStyle = eg;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.restore();
  if (!floorGrad || floorGrad.c !== c) {
    const g = c.createLinearGradient(0, H * .62, 0, H);
    g.addColorStop(0, 'rgba(8,2,10,0)');
    g.addColorStop(1, 'rgba(8,2,10,.45)');
    floorGrad = { c, g };
  }
  c.fillStyle = floorGrad.g;
  c.fillRect(0, 0, W, H);
  bloodPetals(f);
}

/** A few red petals drift across. */
function bloodPetals(f: FinaleFrame): void {
  const { c, t, lite } = f;
  const n = lite ? 6 : 12;
  c.save();
  for (let i = 0; i < n; i++) {
    const life = 3.2;
    const p = ((t * .9 + hash(i) * life) % life) / life;
    const x = W * (1.05 - p * 1.25) + hash(i + 9) * 260;
    const y = -30 + p * (H + 60) + Math.sin(t * 1.6 + i) * 18;
    const s = 5 + hash(i + 3) * 5;
    c.save();
    c.translate(x, y);
    c.rotate(t * (1 + hash(i + 5)) + i);
    c.scale(1, .55 + .45 * Math.sin(t * 3 + i));
    c.globalAlpha = .8 * Math.sin(p * Math.PI);
    c.fillStyle = i % 3 ? '#c4122e' : '#ff5a6a';
    c.beginPath();
    c.moveTo(0, -s);
    c.quadraticCurveTo(s, 0, 0, s);
    c.quadraticCurveTo(-s, 0, 0, -s);
    c.fill();
    c.restore();
  }
  c.restore();
}

export const FINALE_LEADS: Record<string, FinaleLead> = {
  'blood-eye': { lead: BREAK + .35, reveal: .35, tail: 1.4, accent: '#a3142c', drawLead: bloodEye, drawOver: bloodOver },
  'pink-meteor': PINK_METEOR,
};

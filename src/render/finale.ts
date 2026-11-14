import type { FightGame } from '../game/game.ts';
import { FINALE_TIME } from '../game/game.ts';
import type { CharacterData, FinaleSpec } from '../data/types.ts';
import type { ImageCache } from '../assets/loader.ts';
import { H, W } from '../game/constants.ts';
import { isLiteFx } from './fxQuality.ts';
import { FINALE_LEADS } from './finaleLeads.ts';

/* 终幕: the L finisher cut-in, painted over the frozen arena while the match sits in phase 'finale'.
   It has its own canvas over the whole visible arena (the game canvas is cropped differently by every
   layout), and the picture is a fixed 16:9 frame letterboxed inside it like a film: black bars, never a
   crop, so the art always shows whole. Inside the frame everything is drawn in the 960×540 world.

   Shared beats, every character:
     freeze  the killing frame drains to monochrome and the house goes dark (0 – 0.45 s)
     lead    her own lead-in (finaleLeads.ts): the storm, ending in a break that shows the picture
     reveal  the opposite of the storm: stillness. The whole picture is there at once, out of focus and
             unlit; the debris of the lead-in hangs in slow motion; moonlight travels from the hand-off
             point across to her and lights her up; focus settles. No cuts, no shake.
     hold    the camera barely breathes in toward her face, a soft vignette, one slow light sweep,
             the move's name writes itself in with wide tracking closing up
     exit    one slash cuts the still frame in two and the halves slide off the arena
   The clock is the match's `age`, so a guest paints the same moment as the host. Docs: docs/finale-sop.md. */

/** The slash exit at the end (s). */
export const EXIT = .55;
/** The camera's whole move over the held picture: a breath in toward her face, nothing more. */
const DRIFT = .045;
/** Moonlight crossing the picture (s from the reveal start) and the focus settling. */
const LIGHT_IN = 1.5;
const FOCUS_IN = 1.1;
const FREEZE = .45;
const TYPE = '"MF Mono", "MF Poster", "Noto Sans SC", "Microsoft YaHei", sans-serif';

export interface FinaleFrame {
  c: CanvasRenderingContext2D;
  t: number;
  lite: boolean;
  data: CharacterData;
  art: HTMLImageElement | null;
  /** The hand-off point in frame space at the moment the illustration appears. */
  anchor: { x: number; y: number; r: number };
  /** Where the illustration is drawn at time t (cover fit, pushed in). */
  artRect: (t: number) => { x: number; y: number; w: number; h: number };
  /** Paint `draw` once per play into an offscreen copy of the 960×540 frame and reuse it. */
  bake: (name: string, draw: (c: CanvasRenderingContext2D) => void) => HTMLCanvasElement;
}

export interface FinaleLead {
  /** Seconds before the illustration is fully up; it starts showing `reveal` seconds earlier. */
  lead: number;
  reveal: number;
  /** The bar under the move's name; defaults to the character's colour. */
  accent?: string;
  /** Everything before the illustration (and over it while it shows through). */
  drawLead(f: FinaleFrame): void;
  /** How long after `lead` the lead-in keeps drawing over the picture (its debris settling). */
  tail?: number;
  /** Her touch over the held picture, under the shared spotlight and type. */
  drawOver?(f: FinaleFrame): void;
}

export interface FinaleSnapshot { img: CanvasImageSource; x: number; y: number; w: number; h: number }

const ease = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The 16:9 frame inside a cw×ch box (device pixels): contain fit, centred. */
export function finaleFrame(cw: number, ch: number): { x: number; y: number; k: number } {
  const k = Math.min(cw / W, ch / H);
  return { x: (cw - W * k) / 2, y: (ch - H * k) / 2, k };
}

function coverRect(art: HTMLImageElement | null, push: number): { x: number; y: number; w: number; h: number } {
  const aw = art?.naturalWidth || W;
  const ah = art?.naturalHeight || H;
  const k = Math.max(W / aw, H / ah) * (1 + push);
  const w = aw * k, h = ah * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

let filterOk: boolean | null = null;
function canFilter(c: CanvasRenderingContext2D): boolean {
  if (filterOk === null) filterOk = typeof c.filter === 'string';
  return filterOk;
}

/* Per-play offscreen frames (the lead-in's last picture for the glass, the held frame for the slash). */
let bakedFor = -1;
const baked = new Map<string, HTMLCanvasElement>();
function bakeFor(play: number, name: string, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  if (bakedFor !== play) { bakedFor = play; baked.clear(); }
  let cv = baked.get(name);
  if (cv) return cv;
  const q = isLiteFx() ? 1 : 1.6;
  cv = document.createElement('canvas');
  cv.width = Math.round(W * q); cv.height = Math.round(H * q);
  const g = cv.getContext('2d')!;
  g.setTransform(q, 0, 0, q, 0, 0);
  draw(g);
  baked.set(name, cv);
  return cv;
}

let placeholder: HTMLCanvasElement | null = null;
function placeholderArt(data: CharacterData): HTMLCanvasElement {
  if (placeholder && placeholder.dataset.id === data.id) return placeholder;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H; cv.dataset.id = data.id;
  const g = cv.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#120a18'); bg.addColorStop(1, '#2a0f1c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const a = data.finale?.anchor ?? { x: .5, y: .4, r: .15 };
  g.strokeStyle = '#ffffff55'; g.setLineDash([8, 8]); g.lineWidth = 2;
  g.beginPath(); g.arc(a.x * W, a.y * H, a.r * H, 0, Math.PI * 2); g.stroke();
  g.strokeRect(36, H * .64, W * .42, H * .26);
  g.setLineDash([]);
  g.fillStyle = '#ffffff66'; g.font = `600 18px ${TYPE}`; g.textAlign = 'center';
  g.fillText('大图占位', W * .7, H * .62);
  placeholder = cv;
  return cv;
}

/** Paint the whole overlay: freeze frame, bars, the frame's contents, the slash exit. `cw`×`ch` is the
 *  canvas in device pixels; the context comes in untransformed and cleared. `snap` is the killing frame
 *  as it sat on screen, in the same pixel space. */
export function drawFinale(c: CanvasRenderingContext2D, cw: number, ch: number, g: FightGame, images: ImageCache, snap: FinaleSnapshot | null): void {
  const by = g.finaleBy === null ? undefined : g.fighterById(g.finaleBy);
  const spec = by?.data.finale;
  if (!by || !spec) return;
  const lead = FINALE_LEADS[spec.fx];
  if (!lead) return;
  const t = Math.max(0, g.age - g.finaleAt);
  const lite = isLiteFx();
  const holdEnd = FINALE_TIME - EXIT;
  const fr = finaleFrame(cw, ch);
  const play = g.finaleAt;

  // Freeze: the killing frame drains to monochrome, leans in, and sinks into the dark.
  if (snap && t < FREEZE + .1) {
    const k = ease(t / .22);
    c.save();
    const z = 1 + .05 * ease(t / FREEZE);
    c.translate(cw / 2, ch / 2); c.scale(z, z); c.translate(-cw / 2, -ch / 2);
    if (!lite && canFilter(c)) c.filter = `grayscale(${k.toFixed(2)}) contrast(${(1 + .35 * k).toFixed(2)})`;
    c.drawImage(snap.img, snap.x, snap.y, snap.w, snap.h);
    c.filter = 'none';
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = `rgba(150,20,40,${(.55 * k).toFixed(3)})`;
    c.fillRect(0, 0, cw, ch);
    c.restore();
  }
  // The house stays dark everywhere, bars included, until the slash takes the frame away.
  const dark = t < holdEnd ? ease((t - .12) / (FREEZE - .12)) : 1 - ease((t - holdEnd - .2) / (EXIT - .2));
  if (dark > 0) {
    c.fillStyle = `rgba(5,2,8,${dark.toFixed(3)})`;
    c.fillRect(0, 0, cw, ch);
  }

  const loaded = spec.art ? images.get(spec.art) : undefined;
  const art = loaded && loaded.complete && loaded.naturalWidth ? loaded : null;
  const show = lead.lead - lead.reveal;
  // The picture itself never moves: the camera breath is applied around her face in drawFrame, so the
  // lead-in's hand-off point stays exactly on the picture's own moon.
  const artRect = (_time: number) => coverRect(art, 0);
  const r0 = artRect(lead.lead);
  const a = spec.anchor ?? { x: .5, y: .4, r: .15 };
  const frame: FinaleFrame = {
    c, t, lite, data: by.data, art, artRect,
    anchor: { x: r0.x + a.x * r0.w, y: r0.y + a.y * r0.h, r: a.r * r0.h },
    bake: (name, draw) => bakeFor(play, name, draw),
  };

  c.save();
  c.setTransform(fr.k, 0, 0, fr.k, fr.x, fr.y);
  if (t < holdEnd) {
    drawFrame(frame, spec, lead, art, show, g.finaleHint);
  } else {
    // The held frame, baked once, is cut along a diagonal and the halves slide apart.
    const held = bakeFor(play, 'held', h => drawFrame({ ...frame, c: h, t: holdEnd - .001 }, spec, lead, art, show, 0));
    slashExit(c, held, (t - holdEnd) / EXIT, lead.accent ?? by.data.color);
  }
  c.restore();
}

function drawFrame(f: FinaleFrame, spec: FinaleSpec, lead: FinaleLead, art: HTMLImageElement | null, show: number, hint: number): void {
  const { c, t, lite, data } = f;
  const holdEnd = FINALE_TIME - EXIT;
  if (t >= show) {
    const r = f.artRect(t);
    const s = t - show;
    const pic = art ?? placeholderArt(data);
    const fx = r.x + (spec.focus?.x ?? .65) * r.w, fy = r.y + (spec.focus?.y ?? .35) * r.h;
    c.save();
    c.beginPath(); c.rect(0, 0, W, H); c.clip();
    // The breath: one slow, continuous push toward her face over the whole hold.
    const z = 1 + DRIFT * Math.pow(clamp01(s / (holdEnd - show)), .8);
    c.translate(fx, fy); c.scale(z, z); c.translate(-fx, -fy);
    const blur = (1 - ease(s / FOCUS_IN)) * 9;
    if (!lite && blur > .3 && canFilter(c)) c.filter = `blur(${blur.toFixed(1)}px)`;
    c.drawImage(pic, r.x, r.y, r.w, r.h);
    c.filter = 'none';
    moonlight(f, spec, s);
    spotlight(f, spec, s);
    lead.drawOver?.(f);
    flare(f, s);
    c.restore();
    lightSweep(c, s - 1.9);
    drawName(c, data, s - 1.2, lead.accent ?? data.color);
  }
  if (t < lead.lead + (lead.tail ?? .35)) lead.drawLead(f);
  if (hint > 0) skipHint(c, Math.min(1, hint * 4));
}

/** The picture starts unlit; light travels out of the hand-off point (her moon) across the frame,
 *  past her, and the dark lifts behind its front. */
function moonlight(f: FinaleFrame, spec: FinaleSpec, s: number): void {
  const p = s / LIGHT_IN;
  if (p >= 1.3) return;
  const { c, anchor } = f;
  const r = f.artRect(f.t);
  const fx = r.x + (spec.focus?.x ?? .65) * r.w, fy = r.y + (spec.focus?.y ?? .35) * r.h;
  // From the moon to well past her, so the front clears the whole frame.
  const ex = fx + (fx - anchor.x) * .9, ey = fy + (fy - anchor.y) * .9 + H * .4;
  const front = -.15 + 1.3 * ease(p);
  const g = c.createLinearGradient(anchor.x, anchor.y, ex, ey);
  const stops: [number, number][] = [[0, 0]];
  if (front > 0) stops.push([front, 0]);
  stops.push([front + .22, .78], [1, .78]);
  let lastAt = -1;
  for (const [at, a] of stops) { const q = Math.max(lastAt, clamp01(at)); g.addColorStop(q, `rgba(6,2,10,${a.toFixed(3)})`); lastAt = q; }
  c.save();
  c.globalAlpha = 1 - clamp01((p - 1) / .3);
  c.fillStyle = g;
  c.fillRect(-W, -H, W * 3, H * 3);
  c.restore();
  // The front itself glows faintly red as it passes.
  if (p > 0 && p < 1.1) {
    const gl = c.createLinearGradient(anchor.x, anchor.y, ex, ey);
    gl.addColorStop(clamp01(front - .06), 'rgba(255,80,90,0)');
    gl.addColorStop(Math.max(clamp01(front - .06), clamp01(front + .05)), `rgba(255,80,90,${(.16 * (1 - Math.min(1, p))).toFixed(3)})`);
    gl.addColorStop(Math.max(clamp01(front + .05), clamp01(front + .16)), 'rgba(255,80,90,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = gl;
    c.fillRect(-W, -H, W * 3, H * 3);
    c.restore();
  }
}

/** The house light closes on her face: the dark tightens from the frame's edge to a soft oval round her,
 *  then breathes. The oval is a cached unit gradient, placed with a transform. */
let spotGrad: CanvasGradient | null = null;
let spotCtx: CanvasRenderingContext2D | null = null;
function spotlight(f: FinaleFrame, spec: FinaleSpec, s: number): void {
  const { c } = f;
  const r = f.artRect(f.t);
  const fx = r.x + (spec.focus?.x ?? .65) * r.w;
  const fy = r.y + (spec.focus?.y ?? .35) * r.h + H * .12;
  if (!spotGrad || spotCtx !== c) {
    spotCtx = c;
    spotGrad = c.createRadialGradient(0, 0, .35, 0, 0, 1);
    spotGrad.addColorStop(0, 'rgba(6,2,10,0)');
    spotGrad.addColorStop(1, 'rgba(6,2,10,1)');
  }
  const close = ease((s - .8) / 1.6);
  const rad = (W * 1.3 - (W * 1.3 - H * .95) * close) * (1 + .02 * Math.sin(s * 1.4));
  c.save();
  c.globalAlpha = .45 * close;
  c.translate(fx, fy);
  c.scale(rad * 1.25, rad);
  c.fillStyle = spotGrad;
  c.fillRect(-4, -4, 8, 8);
  c.restore();
}

/** One soft diagonal band of light across the picture, once. */
function lightSweep(c: CanvasRenderingContext2D, s: number): void {
  if (s < 0 || s > .7) return;
  const x = -260 + (W + 520) * ease(s / .7);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(x, H / 2);
  c.rotate(.35);
  const grad = c.createLinearGradient(-90, 0, 90, 0);
  grad.addColorStop(0, 'rgba(255,240,235,0)');
  grad.addColorStop(.5, 'rgba(255,240,235,.2)');
  grad.addColorStop(1, 'rgba(255,240,235,0)');
  c.fillStyle = grad;
  c.fillRect(-90, -H, 180, H * 2);
  c.restore();
}

/** An anamorphic streak through the hand-off point when the picture lands, then a faint lingering line. */
function flare(f: FinaleFrame, s: number): void {
  const { c, anchor } = f;
  const k = s < .12 ? s / .12 : 1 - (s - .12) / 1;
  if (k <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(anchor.x, anchor.y);
  c.scale(1, .016);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, W * .75);
  g.addColorStop(0, `rgba(255,235,230,${(.45 * k).toFixed(3)})`);
  g.addColorStop(.25, `rgba(255,90,110,${(.2 * k).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,90,110,0)');
  c.fillStyle = g;
  c.fillRect(-W, -W * .75, W * 2, W * 1.5);
  c.restore();
}

/** The move's name writes itself in: a hairline in her colour draws out, the characters arrive from
 *  wide tracking and soft focus and close up into the word, her name follows, smaller and spaced. */
function drawName(c: CanvasRenderingContext2D, data: CharacterData, s: number, accent: string): void {
  if (s < 0) return;
  const move = data.skills[5]?.name ?? '';
  const chars = [...move];
  const x = 56, y = H * .8;
  c.save();
  c.font = `700 42px ${TYPE}`;
  c.textBaseline = 'alphabetic';
  const widths = chars.map(ch => c.measureText(ch).width);
  const span = widths.reduce((a, b) => a + b, 0) + 6 * (chars.length - 1);
  // The hairline.
  const l = ease(s / .9);
  const lg = c.createLinearGradient(x - 20, 0, x + span + 60, 0);
  lg.addColorStop(0, accent); lg.addColorStop(.7, accent); lg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = lg;
  c.globalAlpha = .9;
  c.fillRect(x - 20, y + 12, (span + 80) * l, 2);
  // The characters.
  c.shadowColor = accent;
  c.shadowBlur = 14;
  let cx = x;
  chars.forEach((ch, i) => {
    const p = clamp01((s - .1 - i * .09) / .7);
    if (p > 0) {
      const e = ease(p);
      c.globalAlpha = e;
      c.fillStyle = '#fff';
      c.fillText(ch, cx + (1 - e) * (18 + i * 10), y - (1 - e) * 4);
    }
    cx += widths[i] + 6;
  });
  // Her name, small and spaced, after the word has settled.
  const n = clamp01((s - .55 - chars.length * .09) / .6);
  if (n > 0) {
    c.shadowBlur = 0;
    c.globalAlpha = ease(n) * .9;
    c.font = `500 15px ${TYPE}`;
    c.fillStyle = '#efe6f0';
    let nx = x;
    for (const ch of data.name) { c.fillText(ch, nx, y + 38); nx += c.measureText(ch).width + 7; }
  }
  c.restore();
}

/** The exit: a white line cuts the held frame on a diagonal, the halves slide apart and fade, the arena shows. */
function slashExit(c: CanvasRenderingContext2D, held: HTMLCanvasElement, e: number, accent: string): void {
  // Line from bottom-left to top-right.
  const ax = W * .1, ay = H * 1.05, bx = W * .9, by = -H * .05;
  const nx = (by - ay), ny = -(bx - ax);
  const nl = Math.hypot(nx, ny);
  const ux = nx / nl, uy = ny / nl;
  const cut = ease(e / .22);
  const part = ease((e - .2) / .8);
  const half = (sign: 1 | -1): void => {
    c.save();
    c.translate(ux * sign * part * 140 - (bx - ax) / Math.hypot(bx - ax, by - ay) * sign * part * 60, uy * sign * part * 140 - (by - ay) / Math.hypot(bx - ax, by - ay) * sign * part * 60);
    c.globalAlpha = 1 - part;
    c.beginPath();
    c.moveTo(ax - (bx - ax), ay - (by - ay)); c.lineTo(bx + (bx - ax), by + (by - ay));
    c.lineTo(bx + (bx - ax) + ux * sign * 2000, by + (by - ay) + uy * sign * 2000);
    c.lineTo(ax - (bx - ax) + ux * sign * 2000, ay - (by - ay) + uy * sign * 2000);
    c.closePath();
    c.clip();
    c.beginPath(); c.rect(0, 0, W, H); c.clip();
    c.drawImage(held, 0, 0, W, H);
    c.restore();
  };
  if (part <= 0) c.drawImage(held, 0, 0, W, H);
  else { half(1); half(-1); }
  // The cutting line: grows along the diagonal, then flares and thins away.
  c.save();
  c.globalCompositeOperation = 'lighter';
  const lx = ax + (bx - ax) * cut, ly = ay + (by - ay) * cut;
  const fade = 1 - clamp01((e - .25) / .45);
  c.strokeStyle = accent;
  c.globalAlpha = fade;
  c.lineWidth = 16 * (1 - part * .8);
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(lx, ly); c.stroke();
  c.strokeStyle = '#fff';
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(lx, ly); c.stroke();
  c.restore();
  if (e > .18 && e < .5) {
    c.fillStyle = `rgba(255,245,240,${(.5 * (1 - (e - .18) / .32)).toFixed(3)})`;
    c.fillRect(-W, -H, W * 3, H * 3);
  }
}

function skipHint(c: CanvasRenderingContext2D, a: number): void {
  c.save();
  c.globalAlpha = a;
  c.font = `600 15px ${TYPE}`;
  const label = '再点一次跳过';
  const w = c.measureText(label).width + 28;
  c.fillStyle = 'rgba(8,6,12,.62)';
  c.beginPath(); c.roundRect(W - w - 22, H - 52, w, 32, 16); c.fill();
  c.fillStyle = '#fff';
  c.textBaseline = 'middle';
  c.fillText(label, W - w - 8, H - 36);
  c.restore();
}

/* 剧情特效：全靠代码画的光效，不用图（道具是纸板图，在 props.ts）。
   剧本写法：> 特效 名字 [参数]，收掉写 > 特效 收 名字（见 story/gemini-skill/剧本格式与演出指令.md）。
     星光流失 [角色|位置]   金色光点不断往上飘走；台上开着裂隙时，光点会被吸进裂隙。不写参数 = 整个舞台都在流失
     裂隙 [位置]            天上撕开一道发紫光的空间裂缝（默认正中）
     法阵 角色|位置         脚下一座黑色法阵，暗紫符文转动、黑光往上冒、偶尔窜过电流
     屏障 角色              角色身前张开一面星光屏障；台上「震屏」时屏障会被打得一亮；收掉时碎成光片
     黑雾 [角色]            黑雾从地面漫上来、舞台变暗；写角色 = 黑雾缠在她身上
     觉醒 角色              一次性：一道柔和的光柱落在她身上，光点上升、整个人被照亮（约 2.5 秒）
   前五种会一直留在台上，直到「收」或这一段演完；觉醒演完自己消失。
   角色身上的「消散」「墨提斯」的实体化也用这里的粒子（fxDissolve / fxGather）。 */

import { SLOT_X } from './stage.ts';

const W = 1280, FLOOR = 578;

export const FX_NAMES = ['星光流失', '裂隙', '法阵', '屏障', '黑雾', '觉醒'];
/** 参数必须是台上的角色。 */
export const FX_NEED_ACTOR = ['屏障', '觉醒'];
/** 参数必须写（角色或站位）。 */
export const FX_NEED_ARG = ['法阵', '屏障', '觉醒'];
/** 会留在台上、能「收」的。 */
export const FX_LASTING = ['星光流失', '裂隙', '法阵', '屏障', '黑雾'];

export interface FxEnv {
  ctx: CanvasRenderingContext2D;
  clock: number;
  zoom: number;
  /** 收纸板（开战）时 0→1。 */
  fold: number;
  xOf(name: string): number | null;
  /** 角色身高（舞台像素，已乘 zoom）。 */
  heightOf(name: string): number;
  faceOf(name: string): number;
  sfx(k: 'sparkle' | 'thud' | 'glitch' | 'pop' | 'flip'): void;
  shake(v: number): void;
  flash(v: number): void;
}

interface Fx {
  kind: string;
  at: string | undefined;
  x: number;
  t: number;
  a: number;
  aTo: number;
  hit: number;
  seed: number;
  emit: number;
  pts?: [number, number][];
  zap: number;
}
interface Mote {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; delay: number;
  c: string; s: number;
  kind: 'mote' | 'drain' | 'shard' | 'gather' | 'dark';
  rot: number; vr: number;
  tx?: number; ty?: number;
}

let list: Fx[] = [];
let motes: Mote[] = [];
const rnd = Math.random;
const ease = (k: number) => k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);

export function resetFx(): void { list = []; motes = []; }
/** 调试用（只在开发服）：控制台里 __storyFx() 看台上开着哪些特效、有多少粒子。 */
if (import.meta.env?.DEV) (globalThis as { __storyFx?: () => unknown }).__storyFx = () => ({ fx: list.map(f => `${f.kind}${f.at ? ' ' + f.at : ''} a=${f.a.toFixed(2)}`), motes: motes.length });
const live = (kind: string) => list.filter(f => f.kind === kind && f.aTo > 0);

function xAt(f: Fx, env: FxEnv): number {
  if (f.at && SLOT_X[f.at] !== undefined) return SLOT_X[f.at];
  if (f.at) { const x = env.xOf(f.at); if (x !== null) f.x = x; }
  return f.x;
}
const isActor = (at: string | undefined, env: FxEnv) => !!at && SLOT_X[at] === undefined && env.xOf(at) !== null;
/** 裂隙的中心（光点往这里流）。 */
const RIFT_Y = 165;

function riftPts(seed: number): [number, number][] {
  // 一道竖着的锯齿裂缝：左缘往下、右缘往上，中间最宽。
  const n = 11, len = 230, out: [number, number][] = [];
  const r = (i: number) => { const v = Math.sin(seed * 91.7 + i * 47.3) * 43758.5; return v - Math.floor(v); };
  const zig: number[] = [];
  for (let i = 0; i <= n; i++) zig.push((r(i) - .5) * 30 + Math.sin(i * .9) * 8);
  for (let i = 0; i <= n; i++) { const w = Math.sin(Math.PI * i / n) * (34 + r(i + 20) * 16); out.push([zig[i] - w, -len / 2 + len * i / n]); }
  for (let i = n; i >= 0; i--) { const w = Math.sin(Math.PI * i / n) * (30 + r(i + 40) * 16); out.push([zig[i] + w, -len / 2 + len * i / n]); }
  return out;
}

/** 特效指令。返回演出要等多久（秒）。 */
export function fxCmd(verb: string, arg: string | undefined, env: FxEnv): number {
  if (verb === '收') {
    let any = false;
    for (const f of list) {
      if (f.kind !== arg || f.aTo === 0) continue;
      any = true; f.aTo = 0;
      const x = xAt(f, env);
      if (f.kind === '屏障') {
        const h = (f.at ? env.heightOf(f.at) : 240) * 1.1, fx = x + env.faceOf(f.at ?? '') * 85 * env.zoom;
        for (let i = 0; i < 46; i++) motes.push({ x: fx + (rnd() - .5) * 30, y: FLOOR - rnd() * h, vx: env.faceOf(f.at ?? '') * (40 + rnd() * 220) * (rnd() < .3 ? -1 : 1), vy: -60 - rnd() * 180, life: 0, max: .7 + rnd() * .7, delay: 0, c: rnd() < .5 ? '#d8f0ff' : '#ffe6a8', s: 3 + rnd() * 5, kind: 'shard', rot: rnd() * 6, vr: (rnd() - .5) * 14 });
        env.sfx('glitch');
      } else if (f.kind === '法阵') {
        for (let i = 0; i < 60; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 150 * env.zoom; motes.push({ x: x + Math.cos(a) * r, y: FLOOR + 4 + Math.sin(a) * r * .28, vx: Math.cos(a) * 60, vy: -80 - rnd() * 200, life: 0, max: .6 + rnd() * .8, delay: 0, c: rnd() < .6 ? '#9a5cff' : '#3a1a66', s: 2 + rnd() * 3.5, kind: 'shard', rot: rnd() * 6, vr: (rnd() - .5) * 10 }); }
        env.flash(.3); env.sfx('glitch');
      } else if (f.kind === '裂隙') { env.sfx('glitch'); env.shake(.25); }
      else if (f.kind === '黑雾') env.sfx('sparkle');
    }
    return any ? .6 : 0;
  }
  if (!FX_NAMES.includes(verb)) return 0;
  const f: Fx = { kind: verb, at: arg, x: 640, t: 0, a: 0, aTo: 1, hit: 0, seed: rnd() * 100, emit: 0, zap: 1 + rnd() };
  f.x = xAt(f, env);
  switch (verb) {
    case '星光流失': list.push(f); env.sfx('sparkle'); return .4;
    case '裂隙': f.pts = riftPts(f.seed); list.push(f); env.shake(.55); env.sfx('glitch'); return .9;
    case '法阵': list.push(f); env.sfx('glitch'); return .7;
    case '屏障': {
      const old = live('屏障').find(o => o.at === arg);
      if (old) { old.hit = 1; env.sfx('thud'); return .35; }
      list.push(f); env.sfx('sparkle'); return .55;
    }
    case '黑雾': list.push(f); env.sfx('glitch'); return 1;
    case '觉醒': f.a = 1; list.push(f); env.flash(.55); env.sfx('sparkle'); return 1.8;
  }
  return 0;
}

/** 震屏时屏障被打得一亮。 */
export function fxImpact(): void { for (const f of live('屏障')) f.hit = 1; }

/** 角色化作光点消散：从脚往上一层层散开、往上飘。tone：gold 金色（消散）/ cold 冷蓝（墨提斯）/ night 暗紫（被打倒的梦魇）。 */
const TONES = { gold: ['#ffe08a', '#fff6d6'], cold: ['#a8d8ff', '#e4f4ff'], night: ['#b48cff', '#e9dcff'] };
export function fxDissolve(x: number, h: number, zoom: number, tone: 'gold' | 'cold' | 'night' = 'gold', dur = 1.4, lying = false): void {
  const [c1, c2] = TONES[tone];
  for (let i = 0; i < 36; i++) {
    const fy = rnd();
    // 躺着的人：光点沿着身体横向铺开（从脚那头往头那头散）。
    motes.push({ x: lying ? x + (fy - .5) * h * .9 : x + (rnd() - .5) * 70 * zoom, y: lying ? FLOOR - 10 - rnd() * 40 * zoom : FLOOR - fy * h, vx: (rnd() - .5) * 40, vy: -30 - rnd() * 70, life: 0, max: 1.1 + rnd() * 1.1, delay: fy * dur * .8 + rnd() * .15, c: rnd() < .5 ? c1 : c2, s: 1.5 + rnd() * 2.6, kind: 'mote', rot: 0, vr: 0 });
  }
}
/** 光点汇聚成形（墨提斯实体化）。 */
export function fxGather(x: number, h: number, zoom: number, cold = true): void {
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = (90 + rnd() * 90) * zoom, ty = FLOOR - rnd() * h;
    motes.push({ x: x + Math.cos(a) * r, y: ty + Math.sin(a) * r * .6, vx: 0, vy: 0, life: 0, max: .55 + rnd() * .35, delay: rnd() * .3, c: cold ? (rnd() < .5 ? '#a8d8ff' : '#e4f4ff') : '#ffe08a', s: 1.5 + rnd() * 2.2, kind: 'gather', rot: 0, vr: 0, tx: x + (rnd() - .5) * 40 * zoom, ty });
  }
}

/** 跳过中：过渡直接到终点，一次性的效果不演。 */
export function snapFx(): void {
  for (const f of list) { f.a = f.aTo; f.t = Math.max(f.t, 9); f.hit = 0; }
  list = list.filter(f => f.aTo > 0 && f.kind !== '觉醒');
  motes = [];
}

export function stepFx(dt: number, env: FxEnv): void {
  const z = env.zoom;
  const rift = live('裂隙')[0];
  for (const f of list) {
    f.t += dt;
    f.a += (f.aTo - f.a) * Math.min(1, dt * (f.kind === '黑雾' ? 1.6 : 4));
    f.hit = Math.max(0, f.hit - dt * 2.2);
    const x = xAt(f, env);
    if (f.aTo === 0) continue;
    if (f.kind === '星光流失') {
      f.emit += dt * (f.at ? 7 : 11);
      while (f.emit >= 1) {
        f.emit--;
        const onActor = isActor(f.at, env);
        const h = onActor ? env.heightOf(f.at!) : 0;
        const sx = onActor ? x + (rnd() - .5) * 70 * z : f.at ? x + (rnd() - .5) * 160 : 120 + rnd() * (W - 240);
        const sy = onActor ? FLOOR - h * (.55 + rnd() * .45) : FLOOR - rnd() * 60;
        motes.push({ x: sx, y: sy, vx: (rnd() - .5) * 30, vy: -45 - rnd() * 45, life: 0, max: 2.2 + rnd() * 1.4, delay: 0, c: rnd() < .55 ? '#ffe08a' : '#fff4cf', s: 2.6 + rnd() * 2.4, kind: rift ? 'drain' : 'mote', rot: 0, vr: 0, tx: rift ? xAt(rift, env) : undefined, ty: RIFT_Y });
      }
    } else if (f.kind === '觉醒') {
      const h = f.at ? env.heightOf(f.at) : 240;
      f.emit += dt * (f.t < 2 ? 14 : 0);
      while (f.emit >= 1) { f.emit--; motes.push({ x: x + (rnd() - .5) * 160 * z, y: FLOOR - rnd() * h * .5, vx: (rnd() - .5) * 20, vy: -110 - rnd() * 150, life: 0, max: 1 + rnd(), delay: 0, c: rnd() < .5 ? '#fff0c8' : '#ffd6ec', s: 2 + rnd() * 3, kind: 'mote', rot: 0, vr: 0 }); }
    } else if (f.kind === '法阵') {
      f.emit += dt * 10;
      while (f.emit >= 1) { f.emit--; const a = rnd() * Math.PI * 2, r = rnd() * 140 * z; motes.push({ x: x + Math.cos(a) * r, y: FLOOR + 4 + Math.sin(a) * r * .28, vx: 0, vy: -50 - rnd() * 60, life: 0, max: 1 + rnd(), delay: 0, c: '#7a40d8', s: 1.6 + rnd() * 2, kind: 'dark', rot: 0, vr: 0 }); }
      f.zap -= dt;
      if (f.zap < -.14) f.zap = .6 + rnd() * 1.4;
    } else if (f.kind === '裂隙') {
      f.zap -= dt;
      if (f.zap < -.12) f.zap = .9 + rnd() * 1.6;
    }
  }
  list = list.filter(f => !(f.aTo === 0 && f.a < .01) && !(f.kind === '觉醒' && f.t > 2.9));
  for (const m of motes) {
    if (m.delay > 0) { m.delay -= dt; continue; }
    m.life += dt;
    if (m.kind === 'drain' && m.tx !== undefined && m.ty !== undefined) {
      const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy) || 1;
      const pull = 160 + m.life * 260;
      m.vx += dx / d * pull * dt; m.vy += dy / d * pull * dt;
      m.vx *= 1 - dt * 1.2; m.vy *= 1 - dt * 1.2;
      if (d < 18) m.life = m.max;
    } else if (m.kind === 'gather' && m.tx !== undefined && m.ty !== undefined) {
      const k = Math.min(1, m.life / m.max);
      m.x += (m.tx - m.x) * Math.min(1, dt * 7 * (.4 + k)); m.y += (m.ty - m.y) * Math.min(1, dt * 7 * (.4 + k));
      continue;
    } else if (m.kind === 'shard') {
      m.vy += 420 * dt; m.vx *= 1 - dt * .8; m.rot += m.vr * dt;
    } else {
      m.vx += Math.sin(m.life * 3 + m.s) * 8 * dt;
      m.vy *= 1 - dt * .3;
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
  }
  // 原地压实：每帧不新建数组。
  let n = 0;
  for (const m of motes) if (m.life < m.max) motes[n++] = m;
  motes.length = n;
  if (n > 900) motes.splice(0, n - 900);
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - ry); ctx.quadraticCurveTo(x, y, x + rx, y); ctx.quadraticCurveTo(x, y, x, y + ry);
  ctx.quadraticCurveTo(x, y, x - rx, y); ctx.quadraticCurveTo(x, y, x, y - ry); ctx.fill();
}

/** 四芒星：上下长、左右短，腰收得窄但看得清（star4 的曲线收腰太细，单独画几乎看不见）。 */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  const w = Math.min(rx, ry) * .28;
  ctx.beginPath();
  ctx.moveTo(x, y - ry); ctx.lineTo(x + w, y - w); ctx.lineTo(x + rx, y); ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + ry); ctx.lineTo(x - w, y + w); ctx.lineTo(x - rx, y); ctx.lineTo(x - w, y - w);
  ctx.closePath(); ctx.fill();
}

/* 黑雾用的一团软雾（烘一次）。 */
let blob: HTMLCanvasElement | null = null;
function fogBlob(): HTMLCanvasElement {
  if (blob) return blob;
  blob = document.createElement('canvas');
  blob.width = blob.height = 256;
  const g = blob.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(16,6,28,.95)'); r.addColorStop(.45, 'rgba(20,8,34,.6)'); r.addColorStop(1, 'rgba(20,8,34,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return blob;
}
const hash = (i: number, k: number) => { const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };

function zigzag(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, n: number, amp: number): void {
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(x0 + (x1 - x0) * t + (rnd() - .5) * amp, y0 + (y1 - y0) * t + (rnd() - .5) * amp); }
  ctx.lineTo(x1, y1); ctx.stroke();
}

/** 画一层（back：角色后面；front：角色前面）。 */
export function drawFx(layer: 'back' | 'front', env: FxEnv): void {
  const { ctx, clock, zoom: z } = env;
  const unfold = 1 - env.fold;
  if (unfold < .01) return;
  for (const f of list) {
    const a = ease(f.a) * unfold;
    if (a < .01) continue;
    const x = xAt(f, env);
    ctx.save();
    if (f.kind === '黑雾') {
      const tex = fogBlob();
      const onActor = isActor(f.at, env);
      if (layer === 'back') {
        // 舞台整体暗下去，顶上压一层紫黑。
        const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
        g.addColorStop(0, `rgba(12,4,24,${.5 * a})`); g.addColorStop(1, `rgba(12,4,24,${(onActor ? .15 : .3) * a})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 720);
        if (onActor) {
          const h = env.heightOf(f.at!);
          for (let i = 0; i < 7; i++) {
            const ang = clock * (.5 + hash(i, 1) * .4) + i * .9, r = (50 + hash(i, 2) * 40) * z;
            const s = (150 + hash(i, 3) * 110) * z;
            ctx.globalAlpha = a * .75;
            ctx.drawImage(tex, x + Math.cos(ang) * r - s / 2, FLOOR - h * (.2 + hash(i, 4) * .7) + Math.sin(ang) * r * .4 - s / 2, s, s);
          }
        }
      } else {
        const n = onActor ? 6 : 16;
        for (let i = 0; i < n; i++) {
          const sp = 14 + hash(i, 5) * 26, dir = i % 2 ? 1 : -1;
          const s = (onActor ? 140 + hash(i, 6) * 90 : 260 + hash(i, 6) * 200) * (onActor ? z : 1);
          let bx: number, by: number;
          if (onActor) { const ang = -clock * .6 + i * 1.1; bx = x + Math.cos(ang) * 70 * z; by = FLOOR - 20 - Math.abs(Math.sin(ang)) * 60 * z; }
          else { bx = ((hash(i, 7) * (W + 400) + clock * sp * dir) % (W + 400) + (W + 400)) % (W + 400) - 200; by = FLOOR + 10 - hash(i, 8) * 70 + Math.sin(clock * .7 + i) * 12; }
          ctx.globalAlpha = a * (onActor ? .55 : .62);
          ctx.drawImage(tex, bx - s / 2, by - s * .35, s, s * .7);
        }
      }
    } else if (f.kind === '裂隙' && layer === 'back' && f.pts) {
      const k = ease(Math.min(1, f.t / .7)) * (f.aTo === 0 ? f.a : 1);
      const cy = RIFT_Y;
      ctx.translate(x, cy);
      ctx.globalAlpha = a;
      const path = () => { ctx.beginPath(); f.pts!.forEach(([px, py], i) => { const X = px * k, Y = py * (.35 + .65 * k); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath(); };
      // 外面一圈紫光
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 190);
      halo.addColorStop(0, `rgba(150,80,255,${.5 * k})`); halo.addColorStop(1, 'rgba(150,80,255,0)');
      ctx.fillStyle = halo; ctx.fillRect(-200, -200, 400, 400);
      ctx.restore();
      path();
      const inner = ctx.createLinearGradient(-40, 0, 40, 0);
      inner.addColorStop(0, '#2a0d52'); inner.addColorStop(.5, '#05010c'); inner.addColorStop(1, '#2a0d52');
      ctx.fillStyle = inner; ctx.fill();
      ctx.shadowColor = '#b06bff'; ctx.shadowBlur = 26;
      ctx.strokeStyle = '#e6ccff'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.shadowBlur = 0;
      // 里面打着旋的星点
      ctx.save(); path(); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const ph = (clock * .35 + hash(i, 9)) % 1;
        const yy = -110 + hash(i, 10) * 220, xx = Math.sin(clock * 1.3 + i) * 14 * (1 - ph);
        ctx.globalAlpha = a * Math.sin(ph * Math.PI) * .9;
        ctx.fillStyle = i % 3 ? '#cfa8ff' : '#fff0ff';
        star4(ctx, xx, yy * (1 - ph * .6), 1.4, 3);
      }
      ctx.restore();
      // 偶尔窜出一道闪电
      if (f.zap < 0) {
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(220,190,255,.9)'; ctx.lineWidth = 1.6;
        ctx.shadowColor = '#c58cff'; ctx.shadowBlur = 10;
        for (let i = 0; i < 2; i++) { const ang = rnd() * Math.PI * 2; zigzag(ctx, 0, (rnd() - .5) * 120, Math.cos(ang) * 150, Math.sin(ang) * 90, 6, 18); }
      }
    } else if (f.kind === '法阵') {
      const grow = ease(Math.min(1, f.t / .6)), R = 150 * z * grow, fy = FLOOR + 4, rot = clock * .45;
      if (layer === 'back') {
        // 黑光往上冒（角色后面）
        const col = ctx.createLinearGradient(0, fy - 300 * z, 0, fy);
        col.addColorStop(0, 'rgba(60,20,120,0)'); col.addColorStop(.6, `rgba(80,30,160,${.22 * a})`); col.addColorStop(1, `rgba(110,50,200,${.6 * a})`);
        ctx.fillStyle = col; ctx.fillRect(x - R, fy - 300 * z, R * 2, 300 * z);
        ctx.translate(x, fy); ctx.scale(1, .28); ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(6,0,14,.7)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
        ctx.shadowColor = '#9a5cff'; ctx.shadowBlur = 16;
        ctx.strokeStyle = '#9a5cff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * .82, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R * .4, 0, 7); ctx.stroke();
        // 两圈之间的符文刻度
        ctx.lineWidth = 2.5;
        // 28 道刻度合成一条路径、一次描边（带 shadowBlur 时每次 stroke 都要单独算一遍模糊）。
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const an = rot + i * Math.PI * 2 / 28;
          ctx.moveTo(Math.cos(an) * R * .85, Math.sin(an) * R * .85); ctx.lineTo(Math.cos(an) * R * (i % 2 ? .93 : .97), Math.sin(an) * R * (i % 2 ? .93 : .97));
        }
        ctx.stroke();
        // 反着转的六芒星
        ctx.lineWidth = 2;
        for (const off of [0, Math.PI / 3]) {
          ctx.beginPath();
          for (let i = 0; i <= 3; i++) { const an = -rot * 1.4 + off + i * Math.PI * 2 / 3; const X = Math.cos(an) * R * .8, Y = Math.sin(an) * R * .8; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
          ctx.stroke();
        }
      } else if (f.zap < 0) {
        // 电流从法阵边缘窜上来，压在角色身上
        ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(190,140,255,.95)'; ctx.lineWidth = 2; ctx.shadowColor = '#9a5cff'; ctx.shadowBlur = 12;
        for (let i = 0; i < 3; i++) { const sx = x + (rnd() - .5) * R * 1.6; zigzag(ctx, sx, fy, x + (rnd() - .5) * 50 * z, fy - (120 + rnd() * 140) * z, 7, 22 * z); }
      }
    } else if (f.kind === '屏障' && layer === 'front') {
      const face = env.faceOf(f.at ?? '') || 1;
      const h = (f.at ? env.heightOf(f.at) : 240) * 1.15;
      const grow = Math.min(1, f.t / .35), k = grow < 1 ? 1 - Math.pow(1 - grow, 3) * Math.cos(grow * 6) : 1;
      const bx = x + face * 95 * z, cy = FLOOR - h / 2, rw = 46 * z * k, rh = h / 2 * k;
      const lit = 1 + f.hit * 1.4;
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
      // 镜片形状：外凸的一面朝前方
      ctx.save(); ctx.translate(bx, cy);
      // 外面一圈柔光
      const halo = ctx.createRadialGradient(0, 0, rw * .3, 0, 0, rh * 1.1);
      halo.addColorStop(0, `rgba(190,225,255,${Math.min(.4, .16 * lit)})`); halo.addColorStop(1, 'rgba(190,225,255,0)');
      ctx.save(); ctx.scale(rw * 2.2 / rh, 1); ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, rh * 1.1, 0, 7); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, 7);
      const g = ctx.createLinearGradient(-rw, 0, rw, 0);
      g.addColorStop(0, 'rgba(160,210,255,0)'); g.addColorStop(.5 + face * .25, `rgba(200,232,255,${Math.min(.6, .26 * lit)})`); g.addColorStop(1, 'rgba(160,210,255,0)');
      ctx.fillStyle = g; ctx.fill();
      // 六角网格
      ctx.save(); ctx.clip();
      ctx.strokeStyle = `rgba(220,240,255,${Math.min(.6, .2 * lit)})`; ctx.lineWidth = 1;
      const hs = 13 * z;
      // 125 个六角格合成一条路径、一次描边。
      ctx.beginPath();
      for (let row = -12; row <= 12; row++) for (let col = -2; col <= 2; col++) {
        const hx = col * hs * 1.5, hy = row * hs * .87 + (col % 2 ? hs * .43 : 0);
        for (let i = 0; i <= 6; i++) { const an = i * Math.PI / 3; const X = hx + Math.cos(an) * hs * .5, Y = hy + Math.sin(an) * hs * .5; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
      }
      ctx.stroke();
      // 一道光从上往下扫过
      const sy = ((clock * .6) % 1.4 - .2) * rh * 2 - rh;
      const sg = ctx.createLinearGradient(0, sy - 30, 0, sy + 30);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,248,230,.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(-rw, sy - 30, rw * 2, 60);
      ctx.restore();
      // 亮边
      ctx.shadowColor = '#bfe6ff'; ctx.shadowBlur = 18 * lit;
      ctx.strokeStyle = `rgba(255,236,190,${Math.min(1, .75 * lit)})`; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, face > 0 ? -Math.PI / 2 : Math.PI / 2, face > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(190,230,255,.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, 7); ctx.stroke();
      // 被打中：一圈波纹
      if (f.hit > 0) {
        const p = 1 - f.hit;
        ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(255,250,235,${f.hit})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, rw * (.3 + p * .9), rh * (.15 + p * .9), 0, 0, 7); ctx.stroke();
      }
      ctx.restore();
    } else if (f.kind === '觉醒') {
      const t = f.t, k = t < .35 ? ease(t / .35) : t < 1.9 ? 1 : 1 - ease((t - 1.9) / 1);
      const h = f.at ? env.heightOf(f.at) : 240;
      ctx.globalCompositeOperation = 'lighter';
      if (layer === 'back') {
        // 光柱：上窄下宽，中轴最亮，两边渐变到透明（和伊泽枣「狼王来了」的月光柱一样的画法）
        const top = 0, wTop = 46 * z, wBot = 230 * z;
        const g = ctx.createLinearGradient(x - wBot, 0, x + wBot, 0);
        g.addColorStop(0, 'rgba(255,236,200,0)'); g.addColorStop(.3, `rgba(255,236,200,${.14 * k})`); g.addColorStop(.42, `rgba(255,240,214,${.36 * k})`); g.addColorStop(.5, `rgba(255,248,232,${.7 * k})`); g.addColorStop(.58, `rgba(255,240,214,${.36 * k})`); g.addColorStop(.7, `rgba(255,236,200,${.14 * k})`); g.addColorStop(1, 'rgba(255,236,200,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x - wTop, top); ctx.lineTo(x + wTop, top); ctx.lineTo(x + wBot, FLOOR + 10); ctx.lineTo(x - wBot, FLOOR + 10); ctx.closePath(); ctx.fill();
        // 落地的光池
        ctx.save(); ctx.translate(x, FLOOR + 4); ctx.scale(1, .22);
        const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 240 * z);
        pool.addColorStop(0, `rgba(255,240,210,${.6 * k})`); pool.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, 240 * z, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        // 身上一层淡淡的正面光，让人看起来被照亮
        const cy = FLOOR - h * .5;
        const g = ctx.createRadialGradient(x, cy, 0, x, cy, h * .62);
        g.addColorStop(0, `rgba(255,244,222,${.45 * k})`); g.addColorStop(.6, `rgba(255,236,210,${.18 * k})`); g.addColorStop(1, 'rgba(255,244,222,0)');
        ctx.fillStyle = g; ctx.fillRect(x - h, cy - h, h * 2, h * 2);
      }
    }
    ctx.restore();
  }
  // 粒子：暗的在后面（法阵的黑光），亮的在前面
  if (!motes.length) return;
  ctx.save();
  for (const m of motes) {
    if (m.delay > 0) continue;
    if ((m.kind === 'dark') !== (layer === 'back')) continue;
    const t = m.life / m.max;
    const fade = m.kind === 'gather' ? Math.min(1, t * 3) : t < .15 ? t / .15 : 1 - (t - .15) / .85;
    ctx.globalAlpha = Math.max(0, fade) * .95 * unfold;
    // 光点用正常叠加（叠在白色纸板、亮背景上也看得见；lighter 叠到白色上就没了）。
    ctx.globalCompositeOperation = m.kind === 'dark' || m.kind === 'mote' || m.kind === 'drain' ? 'source-over' : 'lighter';
    ctx.fillStyle = m.c;
    if (m.kind === 'shard') {
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(m.rot);
      ctx.beginPath(); ctx.moveTo(0, -m.s); ctx.lineTo(m.s * .6, 0); ctx.lineTo(0, m.s * 1.2); ctx.lineTo(-m.s * .5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      // 只画一颗细长的四芒星（不再垫圆形光晕，那样看起来像泡泡），轻轻闪烁。
      const tw = m.kind === 'dark' ? 1 : .7 + .3 * Math.sin(m.life * 9 + m.s * 3);
      ctx.globalAlpha *= tw;
      sparkle(ctx, m.x, m.y, m.s * 2, m.s * 3.6);
    }
  }
  ctx.restore();
}

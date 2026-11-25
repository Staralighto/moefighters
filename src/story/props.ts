/* 剧情道具：纸板布景（星门、囚笼、碎石、星盘、星轨仪），和角色纸板一样有白边、投影，动态效果用代码叠。
   剧本写法：> 道具 名字 动作 [参数]（见 story/gemini-skill/剧本格式与演出指令.md）。
     摆 位置|角色    摆上台（站位，或者某个角色所在的位置；囚笼就是罩住她）
     撤              收走
     亮 [数]         发光；星门写数字 = 亮几道凹槽（红光）
     灭              所有光熄掉
     透光            星门门缝透出光
     合缝            星门旁的石缝合拢（一道光沿裂缝走过）
     锁 / 碎         囚笼缠上黑锁链 / 锁链和笼子一起碎成光屑
     落 位置|道具    从上方掉到地上（碎石），落地亮一圈光晕；写道具名就落在那件道具脚边
     随 角色         拿在某个角色身前，跟着她走
     震              抖一下
   图在 public/story/props/，原图在 素材/剧情道具/。 */

import { SLOT_X } from './stage.ts';

const FLOOR = 578;

interface Spec {
  file: string;
  /** 台上高度（舞台像素，大屏再乘 zoom）。 */
  h: number;
  layer: 'back' | 'front';
  /** 吊在顶上（星轨仪）：y 是顶边。 */
  hang?: number;
  glow: string;
  /** 图内坐标（按 public 里那张图的像素）。 */
  grooves?: [number, number][];
  seam?: { x: number; y0: number; y1: number };
  crack?: [number, number][];
}
export const PROPS: Record<string, Spec> = {
  星门: {
    file: 'stargate', h: 360, layer: 'back', glow: '#ffb0d8',
    grooves: [[106, 203], [184, 104], [317, 54], [450, 103], [527, 203]],
    seam: { x: 317, y0: 150, y1: 815 },
    crack: [[76, 315], [58, 410], [88, 497], [70, 585], [99, 672]],
  },
  囚笼: { file: 'cage', h: 370, layer: 'front', glow: '#e8d8ff' },
  碎石: { file: 'shard', h: 58, layer: 'front', glow: '#ffd9a8' },
  星盘: { file: 'astrolabe', h: 230, layer: 'back', glow: '#ffe0f4' },
  星轨仪: { file: 'orrery', h: 230, layer: 'back', hang: 70, glow: '#d8c8ff' },
};
export const PROP_VERBS = ['摆', '撤', '亮', '灭', '透光', '合缝', '锁', '碎', '落', '随', '震'];

interface Prop {
  name: string;
  spec: Spec;
  x: number;
  /** 落下中的高度偏移（0 = 在位置上）。 */
  drop: number;
  vy: number;
  alpha: number;
  alphaTo: number;
  /** 拿在谁手里。 */
  holder: string | null;
  glow: number;
  glowTo: number;
  grooves: number;
  grooveT: number[];
  seam: number;
  seamTo: number;
  crackT: number;
  chains: number;
  chainsTo: number;
  shake: number;
  halo: number;
  gone: boolean;
}
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number }

export interface PropEnv {
  ctx: CanvasRenderingContext2D;
  clock: number;
  zoom: number;
  /** 台上角色的 x；不在台上 null。 */
  xOf(name: string): number | null;
  /** 角色身高（舞台像素，已乘 zoom），用来把碎石摆在她胸前。 */
  heightOf(name: string): number;
  /** 收纸板（开战）时 0→1。 */
  fold: number;
  sfx(k: 'sparkle' | 'thud' | 'glitch' | 'pop' | 'flip'): void;
}

const images = new Map<string, HTMLImageElement>();
/** px：原图 1 像素 = 烘焙图里几像素（图内坐标换算用）。 */
const baked = new Map<string, { card: HTMLCanvasElement; glow: HTMLCanvasElement; pad: number; k: number; px: number }>();
let props: Prop[] = [];
let sparks: Spark[] = [];

export const propSrc = (name: string): string | null => PROPS[name] ? `/story/props/${PROPS[name].file}.webp` : null;
export function setPropImage(name: string, im: HTMLImageElement): void { images.set(name, im); baked.delete(name); }
export function resetProps(): void { props = []; sparks = []; }

/** 烘一张纸板：白边（把剪影往外描一圈）+ 原图；另烘一张模糊剪影当光晕。按台上尺寸的 2 倍烘，高清屏也清楚。 */
function bake(name: string) {
  const hit = baked.get(name);
  if (hit) return hit;
  const im = images.get(name), spec = PROPS[name];
  if (!im?.naturalWidth) return null;
  const k = Math.min(2, im.naturalHeight / spec.h);
  const h = Math.round(spec.h * k), w = Math.round(im.naturalWidth * h / im.naturalHeight);
  const edge = Math.max(3, Math.round(5 * k)), pad = edge + Math.round(14 * k);
  const make = () => { const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; return c; };
  const sil = make(), sg = sil.getContext('2d')!;
  sg.drawImage(im, pad, pad, w, h);
  sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#fbf9f4'; sg.fillRect(0, 0, sil.width, sil.height);
  // 纸板边外缘一圈灰褐细线（和角色纸板的切边色一样）：先铺略大一圈的灰剪影，再铺白边，最后放原图。
  const rim = make(), rg = rim.getContext('2d')!;
  rg.drawImage(im, pad, pad, w, h);
  rg.globalCompositeOperation = 'source-in'; rg.fillStyle = '#a99f8f'; rg.fillRect(0, 0, rim.width, rim.height);
  const card = make(), g = card.getContext('2d')!;
  const ring = (src: HTMLCanvasElement, r: number) => { for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.drawImage(src, Math.cos(a) * r, Math.sin(a) * r); } };
  ring(rim, edge + Math.max(1, k));
  ring(sil, edge);
  g.drawImage(im, pad, pad, w, h);
  const glow = make(), gg = glow.getContext('2d')!;
  gg.filter = `blur(${Math.round(10 * k)}px)`;
  gg.drawImage(im, pad, pad, w, h);
  gg.filter = 'none'; gg.globalCompositeOperation = 'source-in'; gg.fillStyle = spec.glow; gg.fillRect(0, 0, glow.width, glow.height);
  const b = { card, glow, pad, k, px: h / im.naturalHeight };
  baked.set(name, b);
  return b;
}

const find = (name: string) => props.find(p => p.name === name && !p.gone);
function spawn(x: number, y: number, n: number, c: string, spread = 1): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (40 + Math.random() * 160) * spread;
    sparks.push({ x: x + (Math.random() - .5) * 60 * spread, y: y + (Math.random() - .5) * 80 * spread, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: .7 + Math.random() * .9, c, s: 1.5 + Math.random() * 2.5 });
  }
}

/** 道具指令。返回演出要等多久（秒），让效果看得清。 */
export function propCmd(name: string, verb: string, arg: string | undefined, env: PropEnv): number {
  const spec = PROPS[name];
  if (!spec) return 0;
  let p = find(name);
  // 位置：站位 / 角色（她所在的 x）/ 另一件道具（落在它脚边，例如碎石从星门上掉下来）。
  const at = (a: string | undefined) => {
    if (!a) return 640;
    if (SLOT_X[a] !== undefined) return SLOT_X[a];
    const o = PROPS[a] ? find(a) : undefined;
    if (o) return o.x + o.spec.h * env.zoom * .2;
    return env.xOf(a) ?? 640;
  };
  if (verb === '摆' || verb === '落') {
    if (!p) {
      p = { name, spec, x: 640, drop: 0, vy: 0, alpha: 0, alphaTo: 1, holder: null, glow: 0, glowTo: 0, grooves: 0, grooveT: [], seam: 0, seamTo: 0, crackT: -1, chains: 0, chainsTo: 0, shake: 0, halo: 0, gone: false };
      props.push(p);
    }
    p.x = at(arg); p.holder = null; p.alphaTo = 1;
    if (verb === '落') { p.alpha = 1; p.drop = -260; p.vy = 0; env.sfx('pop'); return .7; }
    env.sfx('flip');
    return .5;
  }
  if (!p) return 0;
  switch (verb) {
    case '撤': p.alphaTo = 0; p.holder = null; env.sfx('flip'); return .4;
    case '随': p.holder = arg ?? null; p.drop = 0; return .2;
    case '亮': {
      const n = Number(arg);
      if (spec.grooves && n > 0) {
        for (let i = p.grooves; i < Math.min(n, spec.grooves.length); i++) p.grooveT[i] = 0;
        p.grooves = Math.min(n, spec.grooves.length);
        p.shake = .35;
      } else p.glowTo = 1;
      env.sfx('sparkle');
      return .6;
    }
    case '灭': p.glowTo = 0; p.grooves = 0; p.seamTo = 0; return .3;
    case '透光': p.seamTo = 1; env.sfx('sparkle'); return .6;
    case '合缝': p.crackT = 0; env.sfx('sparkle'); return 1;
    case '锁': p.chainsTo = 1; env.sfx('glitch'); return .5;
    case '碎': {
      const h = spec.h * env.zoom;
      const cy = spec.hang ? spec.hang + h / 2 : FLOOR - h / 2;
      spawn(p.x, cy, 70, spec.glow, h / 260);
      if (p.chains > .01) spawn(p.x, cy, 40, '#b48cff', h / 260);
      p.gone = true; p.alpha = 0; p.chains = p.chainsTo = 0;
      env.sfx('glitch');
      return .8;
    }
    case '震': p.shake = .5; env.sfx('thud'); return .35;
  }
  return 0;
}

/** 跳过中：所有过渡直接到终点。 */
export function snapProps(): void {
  for (const p of props) { p.alpha = p.alphaTo; p.drop = 0; p.vy = 0; p.glow = p.glowTo; p.seam = p.seamTo; p.chains = p.chainsTo; p.crackT = -1; p.shake = 0; p.halo = 0; p.grooveT = p.grooveT.map(() => 9); }
  props = props.filter(p => !p.gone && p.alphaTo > 0);
  sparks = [];
}

export function stepProps(dt: number): void {
  const app = (v: number, to: number, r: number) => v + (to - v) * Math.min(1, dt * r);
  for (const p of props) {
    p.alpha = app(p.alpha, p.alphaTo, 6);
    p.glow = app(p.glow, p.glowTo, 3);
    p.seam = app(p.seam, p.seamTo, 2.2);
    p.chains = app(p.chains, p.chainsTo, 5);
    p.shake = Math.max(0, p.shake - dt);
    p.halo = Math.max(0, p.halo - dt * .6);
    for (let i = 0; i < p.grooveT.length; i++) if (p.grooveT[i] !== undefined) p.grooveT[i] += dt;
    if (p.crackT >= 0) { p.crackT += dt; if (p.crackT > 1.6) p.crackT = -1; }
    if (p.drop < 0 || p.vy) {
      p.vy += 1500 * dt; p.drop += p.vy * dt;
      if (p.drop >= 0) {
        if (p.vy > 300) { p.vy = -p.vy * .28; p.drop = 0; if (p.halo <= 0) { p.halo = 1; p.glowTo = 1; } }
        else { p.vy = 0; p.drop = 0; }
      }
    }
  }
  props = props.filter(p => !(p.alphaTo === 0 && p.alpha < .01) && !p.gone);
  for (const s of sparks) { s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - dt * 1.5; s.vy = s.vy * (1 - dt * 1.5) - 30 * dt; }
  sparks = sparks.filter(s => s.life < s.max);
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - ry); ctx.quadraticCurveTo(x, y, x + rx, y); ctx.quadraticCurveTo(x, y, x, y + ry);
  ctx.quadraticCurveTo(x, y, x - rx, y); ctx.quadraticCurveTo(x, y, x, y - ry); ctx.fill();
}

/** 画一层道具（back：角色后面；front：角色前面）。 */
export function drawProps(layer: 'back' | 'front', env: PropEnv): void {
  const { ctx, clock, zoom } = env;
  const unfold = 1 - env.fold;
  for (const p of props) {
    if (p.spec.layer !== layer && !(layer === 'front' && p.holder)) continue;
    if (layer === 'back' && p.holder) continue;
    const b = bake(p.name);
    if (!b) continue;
    const spec = p.spec;
    const h = spec.h * zoom, s = h / (b.card.height - b.pad * 2);
    const w = (b.card.width - b.pad * 2) * s;
    let x = p.x, foot = FLOOR + p.drop;
    if (p.holder) {
      const hx = env.xOf(p.holder);
      if (hx === null) continue;
      x = hx; foot = FLOOR - env.heightOf(p.holder) * .38 + Math.sin(clock * 2.2) * 3;
    }
    if (p.shake > 0) x += Math.sin(clock * 70) * 5 * Math.min(1, p.shake * 3);
    const top = spec.hang !== undefined ? spec.hang + (Math.sin(clock * .7) * 4) : foot - h;
    const sw = spec.hang !== undefined ? Math.sin(clock * .45) * .03 : 0;
    const a = p.alpha * unfold;
    if (a < .01) continue;
    ctx.save();
    ctx.globalAlpha = a;
    // 投影（落地的才有）
    if (spec.hang === undefined && !p.holder) {
      ctx.save(); ctx.translate(x, FLOOR + 2); ctx.scale(1, .2);
      const r = w * .6, sh = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.translate(x, top + h / 2);
    if (sw) ctx.rotate(sw);
    const ox = -w / 2, oy = -h / 2;
    // 光晕在纸板后面
    const gl = Math.max(p.glow * (.75 + .25 * Math.sin(clock * 3)), p.halo);
    if (gl > .01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * gl * .9;
      ctx.drawImage(b.glow, ox - b.pad * s, oy - b.pad * s, b.glow.width * s, b.glow.height * s);
      // 小件（碎石）光晕得大过它自己，才看得出「光照亮了四周」。
      if (spec.h < 100) {
        const R = 70 * zoom * (1 + .12 * Math.sin(clock * 3));
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, spec.glow + '66'); g.addColorStop(.4, spec.glow + '26'); g.addColorStop(1, spec.glow + '00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    ctx.drawImage(b.card, ox - b.pad * s, oy - b.pad * s, b.card.width * s, b.card.height * s);
    // 图内坐标 → 本地：原图 1 像素 = u 个舞台像素。
    const u = b.px * s;
    const L = (ix: number, iy: number): [number, number] => [ox + ix * u, oy + iy * u];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 星门凹槽：一道道亮成红光，刚亮时闪一下。凹槽本身画实心红星（叠加色在浅色石头上会被冲淡成白），外面一圈红晕。
    if (spec.grooves) for (let i = 0; i < p.grooves; i++) {
      const [gx, gy] = L(...spec.grooves[i]);
      const t = p.grooveT[i] ?? 9, burst = t < .6 ? 1 - t / .6 : 0;
      const pulse = .85 + .15 * Math.sin(clock * 4 + i);
      const rr = 75 * u * (1 + burst * .9);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
      g.addColorStop(0, `rgba(255,60,80,${.55 * pulse})`); g.addColorStop(.45, `rgba(230,30,70,${.25 * pulse})`); g.addColorStop(1, 'rgba(230,30,70,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, rr, 0, 7); ctx.fill();
      ctx.shadowColor = '#ff3355'; ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = '#e8203f'; star4(ctx, gx, gy, 22 * u, 40 * u);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255,214,214,${.9 * pulse})`; star4(ctx, gx, gy, 9 * u, 20 * u);
      if (burst > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,120,140,${burst * .8})`; star4(ctx, gx, gy, 60 * u * (1 + burst), 110 * u * (1 + burst)); }
      ctx.globalCompositeOperation = 'lighter';
    }
    // 门缝透光
    if (spec.seam && p.seam > .01) {
      const [sx, y0] = L(spec.seam.x, spec.seam.y0), [, y1] = L(spec.seam.x, spec.seam.y1);
      const flick = .85 + .15 * Math.sin(clock * 7) * Math.sin(clock * 2.3);
      const g = ctx.createLinearGradient(sx - 30 * u, 0, sx + 30 * u, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(.5, `rgba(255,240,200,${.7 * p.seam * flick})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - 30 * u, y0, 60 * u, y1 - y0);
      ctx.fillStyle = `rgba(255,252,236,${p.seam * flick})`; ctx.fillRect(sx - 1.2, y0, 2.4, y1 - y0);
    }
    // 合缝：一道光沿着石缝从下往上走过
    if (spec.crack && p.crackT >= 0) {
      const pts = spec.crack.map(([cx, cy]) => L(cx, cy));
      const k = Math.min(1, p.crackT / 1.1), fade = p.crackT > 1.1 ? 1 - (p.crackT - 1.1) / .5 : 1;
      ctx.strokeStyle = `rgba(255,230,200,${.9 * fade})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.shadowColor = '#ffd0a0'; ctx.shadowBlur = 12;
      ctx.beginPath();
      const n = pts.length - 1, reach = k * n;
      for (let i = n; i >= 0; i--) {
        const [px, py] = pts[i];
        if (i === n) ctx.moveTo(px, py);
        else if (n - i <= reach) ctx.lineTo(px, py);
        else { const f = reach - Math.floor(reach); const [qx, qy] = pts[i + 1]; ctx.lineTo(qx + (px - qx) * f, qy + (py - qy) * f); break; }
      }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    ctx.restore();
    // 黑锁链：两道交叉 + 一道横缠
    if (p.chains > .01) {
      ctx.save(); ctx.globalAlpha = a * p.chains;
      const link = (x0: number, y0: number, x1: number, y1: number) => {
        const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / (14 * zoom)), ang = Math.atan2(y1 - y0, x1 - x0);
        for (let i = 0; i <= n; i++) {
          const t = i / n, lx = x0 + (x1 - x0) * t, ly = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 10 * zoom;
          ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang + (i % 2 ? Math.PI / 2 : 0));
          ctx.strokeStyle = '#120a1e'; ctx.lineWidth = 4.5 * zoom; ctx.beginPath(); ctx.ellipse(0, 0, 9 * zoom, (i % 2 ? 3 : 5) * zoom, 0, 0, 7); ctx.stroke();
          ctx.strokeStyle = '#7d5ab8'; ctx.lineWidth = 1.2 * zoom; ctx.stroke();
          ctx.restore();
        }
      };
      link(ox + w * .12, oy + h * .3, ox + w * .88, oy + h * .82);
      link(ox + w * .88, oy + h * .3, ox + w * .12, oy + h * .82);
      link(ox + w * .06, oy + h * .58, ox + w * .94, oy + h * .58);
      ctx.restore();
    }
    ctx.restore();
  }
  if (layer === 'front' && sparks.length) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const sp of sparks) {
      const t = sp.life / sp.max;
      ctx.globalAlpha = (1 - t) * .9 * unfold;
      ctx.fillStyle = sp.c;
      star4(ctx, sp.x, sp.y, sp.s * 1.4, sp.s * 2.6);
    }
    ctx.restore();
  }
}

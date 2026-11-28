import { loadImage } from '../assets/loader.ts';
import { FLOOR } from '../game/constants.ts';
import { RARE_COLOR } from '../musou/constants.ts';
import type { Chest, ChestPrize, Giant, LaserNode, Lift, RareKind, SkyOrb } from '../musou/director.ts';

/* 音浪无双物件与可替换素材层：
   1. 全部非人物物件的程序化绘制与动画都提取到这里；
   2. 显眼识别光效（尖刺音波、金光柱、电弧、星点）与主体图像完全解耦，且只画在底衬或外围，不遮挡中心图案；
   3. 后续生成 GPT 图片后，只需把文件放进 public/musou/objects/ 并在 CUSTOM_OBJECT_ART 填一行路径即可无缝替换。 */

const TAU = Math.PI * 2;

export type MusouObjectKey =
  | 'prop:speaker' | 'prop:crate' | 'prop:rig' | 'prop:cheer'
  | 'giant:tower' | 'giant:board' | 'giant:balloon'
  | 'chest:closed' | 'chest:open'
  | 'lift:stage' | 'laser:node' | 'orb:sky'
  | 'supply:candy' | 'supply:drink' | 'supply:mega' | 'supply:boom' | 'supply:spot'
  | 'rare:tri' | 'rare:fire' | 'rare:cymbal' | 'rare:metro'
  | 'mine:note' | 'gem:star' | 'shot:glow'
  | 'mark:armor' | 'mark:flag';

export interface ObjectSpec { w: number; h: number; ax: number; ay: number }

export const MUSOU_OBJECT_SPECS: Record<MusouObjectKey, ObjectSpec> = {
  'prop:speaker': { w: 72, h: 112, ax: 36, ay: 108 },
  'prop:crate': { w: 76, h: 56, ax: 38, ay: 52 },
  'prop:rig': { w: 128, h: 48, ax: 64, ay: 14 },
  'prop:cheer': { w: 220, h: 48, ax: 110, ay: 42 },
  'giant:tower': { w: 144, h: 220, ax: 72, ay: 220 },
  'giant:board': { w: 196, h: 230, ax: 98, ay: 230 },
  'giant:balloon': { w: 196, h: 256, ax: 98, ay: 256 },
  'chest:closed': { w: 76, h: 64, ax: 38, ay: 60 },
  'chest:open': { w: 86, h: 78, ax: 43, ay: 74 },
  'lift:stage': { w: 184, h: 52, ax: 92, ay: 44 },
  'laser:node': { w: 40, h: 40, ax: 20, ay: 20 },
  'orb:sky': { w: 56, h: 56, ax: 28, ay: 28 },
  'supply:candy': { w: 42, h: 34, ax: 21, ay: 17 },
  'supply:drink': { w: 34, h: 42, ax: 17, ay: 21 },
  'supply:mega': { w: 42, h: 36, ax: 21, ay: 18 },
  'supply:boom': { w: 34, h: 40, ax: 17, ay: 20 },
  'supply:spot': { w: 36, h: 38, ax: 18, ay: 19 },
  'rare:tri': { w: 36, h: 36, ax: 18, ay: 18 },
  'rare:fire': { w: 34, h: 38, ax: 17, ay: 19 },
  'rare:cymbal': { w: 36, h: 36, ax: 18, ay: 18 },
  'rare:metro': { w: 34, h: 36, ax: 17, ay: 18 },
  'mine:note': { w: 28, h: 34, ax: 14, ay: 28 },
  'gem:star': { w: 22, h: 22, ax: 11, ay: 11 },
  'shot:glow': { w: 14, h: 36, ax: 7, ay: 18 },
  'mark:armor': { w: 20, h: 22, ax: 10, ay: 11 },
  'mark:flag': { w: 84, h: 120, ax: 10, ay: 110 },
};

/** 用 PNG 源图路径，生产环境由加载器优先请求 WebP。留空时使用程序化兜底图。 */
export const CUSTOM_OBJECT_ART: Partial<Record<MusouObjectKey, string>> = {
  'prop:speaker': '/musou/objects/prop-speaker.png',
  'prop:crate': '/musou/objects/prop-crate.png',
  'prop:rig': '/musou/objects/prop-rig.png',
  'giant:tower': '/musou/objects/giant-tower.png',
  'giant:board': '/musou/objects/giant-board.png',
  'giant:balloon': '/musou/objects/giant-balloon.png',
  'chest:closed': '/musou/objects/chest-closed.png',
  'chest:open': '/musou/objects/chest-open.png',
  'supply:candy': '/musou/objects/supply-candy.png',
  'supply:drink': '/musou/objects/supply-drink.png',
  'supply:mega': '/musou/objects/supply-mega.png',
  'supply:boom': '/musou/objects/supply-boom.png',
  'supply:spot': '/musou/objects/supply-spot.png',
  'rare:fire': '/musou/objects/rare-fire.png',
};

const artImgs = new Map<string, HTMLImageElement | null>();

function customArt(key: MusouObjectKey): HTMLImageElement | null {
  const path = CUSTOM_OBJECT_ART[key];
  if (!path || typeof Image === 'undefined') return null;
  if (!artImgs.has(path)) {
    artImgs.set(path, null);
    void loadImage(path, 1).then(im => artImgs.set(path, im)).catch(() => { /* 加载失败时继续画兜底图 */ });
  }
  return artImgs.get(path) ?? null;
}

/** 图片按原比例绘制：面积与规格框相同（宽高各不超过规格 1.3 倍），锚点按比例换算，脚底/挂点始终对齐。 */
function slotRect(sp: ObjectSpec, im: HTMLImageElement, x: number, y: number, scale: number): [number, number, number, number] {
  const ar = im.naturalWidth / im.naturalHeight;
  let dh = Math.sqrt(sp.w * sp.h / ar), dw = dh * ar;
  const k = Math.min(1, sp.w * 1.3 / dw, sp.h * 1.3 / dh);
  dw *= k * scale; dh *= k * scale;
  return [x - sp.ax / sp.w * dw, y - sp.ay / sp.h * dh, dw, dh];
}

function drawSlot(c: CanvasRenderingContext2D, key: MusouObjectKey, x: number, y: number, scale: number, fallback: () => void): boolean {
  const im = customArt(key);
  if (!im) { fallback(); return false; }
  const [dx, dy, dw, dh] = slotRect(MUSOU_OBJECT_SPECS[key], im, x, y, scale);
  c.drawImage(im, dx, dy, dw, dh);
  return true;
}

/** 受击闪白：图片版直接叠一层自身（lighter），不画方块。 */
function flashSlot(c: CanvasRenderingContext2D, key: MusouObjectKey, x: number, y: number, scale: number, a: number): void {
  const im = customArt(key);
  if (!im) return;
  const [dx, dy, dw, dh] = slotRect(MUSOU_OBJECT_SPECS[key], im, x, y, scale);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha *= a;
  c.drawImage(im, dx, dy, dw, dh);
  c.restore();
}

const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const hexA = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${Math.max(0, a)})`; };

function star4(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

function noteGlyph(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath(); c.ellipse(x, y, r, r * .72, -.4, 0, TAU); c.fill();
  c.fillRect(x + r * .7, y - r * 3.2, r * .32, r * 3.2);
  c.beginPath(); c.moveTo(x + r * 1.02, y - r * 3.2); c.quadraticCurveTo(x + r * 2.4, y - r * 2.4, x + r * 1.6, y - r * 1.3); c.lineTo(x + r * 1.02, y - r * 2.2); c.fill();
}

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ==================== 通用外围识别光效（叠在主体外围，不遮挡贴图中心） ==================== */

/** 从中心外缘持续颤抖扩散的尖刺形音波（用于地面音箱阵、啸叫扩音塔）。 */
export function drawSpikySoundwave(
  c: CanvasRenderingContext2D, cx: number, cy: number,
  rMin: number, rMax: number, color: string, t: number,
  speed = 1.65, spikes = 16, alpha = .85, flatY = .85,
): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.lineJoin = 'round';
  for (let w = 0; w < 3; w++) {
    const u = (t * speed + w / 3) % 1;
    const fade = Math.sin(Math.min(1, u / .18) * Math.PI * .5) * Math.max(0, 1 - u);
    if (fade <= .02) continue;
    const baseR = rMin + (rMax - rMin) * u;
    const amp = (7 + u * 14) * (.7 + .3 * Math.sin(t * 28 + w * 2));
    const trace = () => {
      c.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const idx = i % (spikes * 2);
        const a = idx * TAU / (spikes * 2) + w * .2;
        const isTip = idx % 2 === 0;
        const jit = Math.sin(t * 34 + idx * 2.3 + w * 1.9);
        const r = baseR + (isTip ? amp * (.55 + .45 * jit) : -amp * .22);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r * flatY;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
    };
    trace();
    c.strokeStyle = hexA(color, alpha * .42 * fade);
    c.lineWidth = 3.6;
    c.stroke();
    trace();
    c.strokeStyle = hexA('#fff4fa', alpha * .85 * fade);
    c.lineWidth = 1.25;
    c.stroke();
  }
  c.restore();
}

function groundHalo(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(x, y);
  c.scale(1, .24);
  const gr = c.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, hexA(color, a));
  gr.addColorStop(1, hexA(color, 0));
  c.fillStyle = gr;
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.restore();
}

function slimBeacon(c: CanvasRenderingContext2D, x: number, floorY: number, w: number, h: number, color: string, a: number): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createLinearGradient(0, floorY, 0, floorY - h);
  gr.addColorStop(0, hexA(color, a));
  gr.addColorStop(.55, hexA(color, a * .42));
  gr.addColorStop(1, hexA(color, 0));
  c.fillStyle = gr;
  c.fillRect(x - w / 2, floorY - h, w, h);
  c.restore();
}

function orbitStars(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, t: number, count = 3): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const a = t * 2.4 + i * TAU / count;
    const sx = cx + Math.cos(a) * rx;
    const sy = cy + Math.sin(a) * ry - Math.abs(Math.sin(a + t)) * 6;
    c.fillStyle = hexA(i % 2 ? '#ffffff' : color, .82);
    star4(c, sx, sy, 5 + Math.sin(t * 9 + i) * 1.5);
  }
  c.restore();
}

/* ==================== 场景机关与物件（底衬 + 图层 + 外围光效） ==================== */

/** 地面音箱阵：粉色底光 + 音箱本体 + 外围持续颤抖尖刺音波。 */
export function drawPropSpeaker(c: CanvasRenderingContext2D, x: number, t: number): void {
  const pulse = .75 + .25 * Math.sin(t * 10);
  groundHalo(c, x, FLOOR + 2, 72, '#ff6fa8', .32 * pulse);
  drawSlot(c, 'prop:speaker', x, FLOOR, 1, () => {
    for (let k = 0; k < 2; k++) {
      const y = FLOOR - 56 - k * 52, wdt = 64;
      c.fillStyle = '#151827';
      c.beginPath(); c.roundRect(x - wdt / 2, y, wdt, 52, 6); c.fill();
      c.strokeStyle = '#2d3352'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#0a0c16';
      c.beginPath(); c.arc(x, y + 26, 17, 0, TAU); c.fill();
      c.strokeStyle = '#ff6fa8'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y + 26, 17 + Math.sin(t * 10) * 1.5, 0, TAU); c.stroke();
    }
  });
  // 外围颤抖尖刺音波（rMin=32 避开音箱中心，替换成 GPT 图后主体依然干净）。
  drawSpikySoundwave(c, x, FLOOR - 56, 32, 84, '#ff6fa8', t, 1.7, 14, .82, .9);
}

/** 补给箱：暖金光柱 + 箱体 + 外围巡游金星与扫光。 */
export function drawPropCrate(c: CanvasRenderingContext2D, x: number, t: number): void {
  groundHalo(c, x, FLOOR + 2, 64, '#E9C46A', .28);
  slimBeacon(c, x, FLOOR, 36, 145, '#FDE979', .22);
  drawSlot(c, 'prop:crate', x, FLOOR, 1, () => {
    c.fillStyle = '#20263d';
    c.beginPath(); c.roundRect(x - 34, FLOOR - 46, 68, 46, 6); c.fill();
    c.strokeStyle = '#E9C46A'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#E9C46A';
    star4(c, x, FLOOR - 23, 11 + Math.sin(t * 4) * 1.5);
  });
  orbitStars(c, x, FLOOR - 34, 42, 16, '#FDE979', t, 3);
}

/** 应援区：地面粉光池 + 荧光棒本体 + 外围脉冲光环与上升星点。 */
export function drawPropCheer(c: CanvasRenderingContext2D, x: number, t: number, a: number): void {
  c.save();
  c.globalAlpha *= a;
  groundHalo(c, x, FLOOR + 2, 130, '#ff6fa8', .45);
  drawSlot(c, 'prop:cheer', x, FLOOR, 1, () => {
    for (let i = 0; i < 5; i++) {
      const px = x - 100 + i * 50, sw = Math.sin(t * 6 + i) * .5;
      c.save(); c.translate(px, FLOOR - 6); c.rotate(sw);
      c.fillStyle = i % 2 ? '#ff6fa8' : '#76e7ff';
      c.fillRect(-2, -34, 4, 26);
      c.fillStyle = '#ffffff'; c.fillRect(-2, -36, 4, 5);
      c.restore();
    }
  });
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(x, FLOOR + 2);
  c.scale(1, .2);
  const ringR = 115 + Math.sin(t * 5) * 6;
  c.strokeStyle = 'rgba(255,111,168,.55)'; c.lineWidth = 2.5;
  c.beginPath(); c.arc(0, 0, ringR, 0, TAU); c.stroke();
  c.restore();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const u = (t * .8 + i * .17) % 1;
    const mx = x + Math.sin(i * 2.1 + t * 2) * 95;
    const my = FLOOR - 8 - u * 54;
    c.fillStyle = hexA(i % 2 ? '#ff6fa8' : '#76e7ff', .75 * (1 - u));
    c.beginPath(); c.arc(mx, my, 2, 0, TAU); c.fill();
  }
  c.restore();
}

/** 吊灯架：钢索 + 灯架本体 + 灯光锥 + 待机时外围警戒脉冲。 */
export function drawPropRig(c: CanvasRenderingContext2D, x: number, fall: number, active: boolean, t: number): void {
  const y = 92 + (FLOOR - 112) * fall * fall;
  if (fall < 1) {
    c.strokeStyle = 'rgba(200,210,240,.5)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x - 40, 0); c.lineTo(x - 40, y); c.moveTo(x + 40, 0); c.lineTo(x + 40, y); c.stroke();
  }
  c.save();
  c.translate(x, y);
  if (fall >= 1) c.rotate(.12);
  drawSlot(c, 'prop:rig', 0, 0, 1, () => {
    c.strokeStyle = '#9aa3c7'; c.lineWidth = 3;
    c.strokeRect(-60, -10, 120, 20);
    c.beginPath(); for (let i = -60; i < 60; i += 20) { c.moveTo(i, -10); c.lineTo(i + 20, 10); } c.stroke();
    c.fillStyle = '#1b1f33'; c.beginPath(); c.roundRect(-16, 8, 32, 26, 5); c.fill();
  });
  if (active) {
    c.globalCompositeOperation = 'lighter';
    const gr = c.createLinearGradient(0, 34, 0, 160);
    gr.addColorStop(0, 'rgba(255,236,170,.35)'); gr.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(-10, 34); c.lineTo(10, 34); c.lineTo(40, 160); c.lineTo(-40, 160); c.fill();
    const gl = .55 + .45 * Math.sin(t * 14);
    c.fillStyle = `rgba(253,233,121,${.85 * gl})`;
    star4(c, 0, 22, 6);
  }
  c.restore();
}

/** 巨型障碍物 / 啸叫扩音塔：底光 + 主体槽位 + 受击裂纹 + 外围尖刺音波/电弧。 */
export function drawGiantObject(c: CanvasRenderingContext2D, gi: Giant, accent: string, dy: number, alpha: number, t: number, slide = 0): void {
  const x = gi.x + slide, base = FLOOR + dy;
  const hurt = gi.flash > 0;
  const standing = dy === 0 && !slide;
  if (standing) groundHalo(c, x, FLOOR + 2, 118, gi.kind === 'tower' ? '#ff5a5a' : accent, .32 * alpha);
  c.save();
  c.globalAlpha *= alpha;
  const key: MusouObjectKey = gi.kind === 'tower' ? 'giant:tower' : gi.kind === 'board' ? 'giant:board' : 'giant:balloon';
  const art = drawSlot(c, key, x, base, 1, () => {
    if (gi.kind === 'tower') {
      for (let i = 0; i < 3; i++) {
        const w = 130 - i * 10, h = 70, y = base - (i + 1) * h;
        c.fillStyle = '#141829';
        c.beginPath(); c.roundRect(x - w / 2, y, w, h - 4, 8); c.fill();
        c.strokeStyle = '#2d3352'; c.lineWidth = 3; c.stroke();
        for (const s of [-1, 1]) {
          c.fillStyle = '#0a0c16'; c.beginPath(); c.arc(x + s * w * .22, y + h / 2 - 2, 22, 0, TAU); c.fill();
          c.strokeStyle = accent; c.lineWidth = 2.5; c.beginPath(); c.arc(x + s * w * .22, y + h / 2 - 2, 22 + Math.sin(t * 10 + i) * 1.5, 0, TAU); c.stroke();
        }
      }
    } else if (gi.kind === 'board') {
      c.save();
      c.translate(x, base);
      c.rotate(-.06);
      c.fillStyle = '#20263d';
      c.beginPath(); c.roundRect(-90, -220, 180, 220, 10); c.fill();
      c.fillStyle = accent; c.globalAlpha = alpha * .85;
      c.beginPath(); c.moveTo(-90, -160); c.lineTo(90, -200); c.lineTo(90, -150); c.lineTo(-90, -110); c.closePath(); c.fill();
      c.globalAlpha = alpha;
      c.fillStyle = '#FDE979'; star4(c, 40, -70, 16); star4(c, -50, -40, 10);
      c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.roundRect(-90, -220, 180, 220, 10); c.stroke();
      c.restore();
    } else {
      const r = 95, cy = base - 150 + Math.sin(t * 2) * 4;
      const gr = c.createRadialGradient(x - r * .35, cy - r * .4, r * .1, x, cy, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(.25, accent); gr.addColorStop(1, '#5a1840');
      c.fillStyle = gr;
      c.beginPath(); c.ellipse(x, cy, r * .92, r, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, cy + r); c.quadraticCurveTo(x + 12, cy + r + 30, x - 4, base); c.stroke();
    }
  });
  if (hurt && art) flashSlot(c, key, x, base, 1, .45);
  else if (hurt) {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,255,255,.22)';
    c.fillRect(x - 95, base - 235, 190, 235);
  }
  c.restore();

  const dmg = 1 - Math.max(0, gi.hp / gi.max);
  if (dmg > .2 && standing) {
    c.save();
    c.strokeStyle = `rgba(255,255,255,${.25 + dmg * .4})`; c.lineWidth = 2;
    const R = rng(Math.floor(gi.x));
    const n = Math.floor(dmg * 6);
    for (let i = 0; i < n; i++) {
      let px = x + (R() - .5) * 100, py = base - 40 - R() * 160;
      c.beginPath(); c.moveTo(px, py);
      for (let k = 0; k < 3; k++) { px += (R() - .5) * 30; py += (R() - .5) * 30; c.lineTo(px, py); }
      c.stroke();
    }
    c.restore();
  }

  // 外围醒目过载提示光效（啸叫塔配紧迫颤抖尖刺音波，其余配外围警示电弧/气压圈）。
  if (standing && gi.phase === 'stand') {
    const urgency = 1 + Math.max(0, 1 - gi.life / gi.lifeMax) * .9;
    if (gi.kind === 'tower') {
      drawSpikySoundwave(c, x, FLOOR - 115, 58, 138, '#ff5a5a', t, 1.45 * urgency, 18, .85, .85);
    } else {
      drawSpikySoundwave(c, x, FLOOR - 130, 74, 132, '#ff8a5c', t, 1.2 * urgency, 14, .6, .88);
    }
  }
}

/** 宝箱：闭合/打开槽位 + 闭合时外围巡游金星。 */
export function drawChestObject(c: CanvasRenderingContext2D, ch: Chest, t: number): void {
  const open = ch.state === 0 ? 0 : Math.min(1, ch.t / .3);
  const bob = ch.state === 0 ? Math.sin(t * 3) * 1.5 : 0;
  const x = ch.x, y = FLOOR - 2 + bob;
  const key: MusouObjectKey = ch.state === 0 ? 'chest:closed' : 'chest:open';
  drawSlot(c, key, x, y, 1, () => {
    c.save();
    c.fillStyle = '#1d2342';
    c.beginPath(); c.roundRect(x - 34, y - 40, 68, 40, 6); c.fill();
    c.strokeStyle = '#E9C46A'; c.lineWidth = 2.5; c.stroke();
    c.fillStyle = '#E9C46A';
    c.fillRect(x - 3, y - 40, 6, 40);
    c.translate(x, y - 40);
    c.rotate(-open * 1.9);
    c.fillStyle = '#252c52';
    c.beginPath(); c.roundRect(-36, -18, 72, 18, [8, 8, 2, 2]); c.fill();
    c.strokeStyle = '#E9C46A'; c.stroke();
    c.fillStyle = '#E9C46A'; c.fillRect(-3, -18, 6, 18);
    c.restore();
  });
  if (ch.state === 0) orbitStars(c, x, y - 24, 44, 16, '#FDE979', t, 3);
}

/** 升降舞台：发光圆台本体槽位 + 两侧护栏光帘。 */
export function drawLiftObject(c: CanvasRenderingContext2D, l: Lift, h: number, k: number, blink: number, color: string): void {
  c.save();
  c.globalAlpha *= blink;
  const top = FLOOR - h;
  drawSlot(c, 'lift:stage', l.x, FLOOR, 1, () => {
    const side = c.createLinearGradient(0, top, 0, FLOOR);
    side.addColorStop(0, '#2b2f52'); side.addColorStop(1, '#10122a');
    c.fillStyle = side;
    c.beginPath();
    c.ellipse(l.x, FLOOR, l.r, 18, 0, 0, Math.PI);
    c.lineTo(l.x - l.r, top);
    c.ellipse(l.x, top, l.r, 18, 0, Math.PI, 0, true);
    c.closePath(); c.fill();
    const face = c.createRadialGradient(l.x, top, 0, l.x, top, l.r);
    face.addColorStop(0, hexA(color, .55)); face.addColorStop(.8, hexA(color, .2)); face.addColorStop(1, hexA('#ffffff', .5));
    c.fillStyle = face;
    c.beginPath(); c.ellipse(l.x, top, l.r, 18, 0, 0, TAU); c.fill();
    c.strokeStyle = hexA('#ffffff', .8); c.lineWidth = 2;
    c.beginPath(); c.ellipse(l.x, top, l.r, 18, 0, 0, TAU); c.stroke();
  });
  c.globalCompositeOperation = 'lighter';
  for (const s of [-1, 1]) {
    const gx = l.x + s * l.r;
    const gr = c.createLinearGradient(gx - 10, 0, gx + 10, 0);
    gr.addColorStop(0, hexA(color, 0)); gr.addColorStop(.5, hexA(color, .45 * k)); gr.addColorStop(1, hexA(color, 0));
    c.fillStyle = gr;
    c.fillRect(gx - 10, top - 110, 20, 110 + h);
  }
  c.restore();
}

/** 高空激光灯箱：外围锁定脉冲环 + 灯箱本体 + 血条。 */
export function drawLaserNodeObject(c: CanvasRenderingContext2D, nd: LaserNode, firing: boolean, t: number): void {
  if (nd.dead) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = hexA(firing ? '#ff5aa5' : '#FDE979', .55 + .35 * Math.sin(t * 14));
  c.lineWidth = 2;
  c.beginPath(); c.arc(nd.x, nd.y, 26 + Math.sin(t * 10) * 2, 0, TAU); c.stroke();
  c.restore();
  drawSlot(c, 'laser:node', nd.x, nd.y, 1, () => {
    c.fillStyle = nd.flash > 0 ? '#ffffff' : '#1b1f38';
    c.strokeStyle = firing ? '#ff5aa5' : '#FDE979';
    c.lineWidth = 2;
    c.beginPath(); c.roundRect(nd.x - 18, nd.y - 18, 36, 36, 6); c.fill(); c.stroke();
    c.fillStyle = firing ? '#ff5aa5' : '#ff9ad5';
    c.beginPath(); c.arc(nd.x, nd.y, 7 + Math.sin(t * 14) * 1.5, 0, TAU); c.fill();
  });
  c.fillStyle = 'rgba(8,8,18,.8)'; c.fillRect(nd.x - 16, nd.y - 26, 32, 4);
  c.fillStyle = '#7fe7ff'; c.fillRect(nd.x - 16, nd.y - 26, 32 * Math.max(0, nd.hp / nd.max), 4);
}

/** 空中高压电球：电晕光环 + 本体槽位 + 外围旋转青黄电弧。 */
export function drawSkyOrbObject(c: CanvasRenderingContext2D, o: SkyOrb, t: number): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 2);
  gr.addColorStop(0, o.phase === 'fall' ? 'rgba(127,231,255,.75)' : 'rgba(253,233,121,.55)');
  gr.addColorStop(1, 'rgba(253,233,121,0)');
  c.fillStyle = gr;
  c.beginPath(); c.arc(o.x, o.y, o.r * 2, 0, TAU); c.fill();
  if (o.phase === 'fall') {
    c.strokeStyle = 'rgba(127,231,255,.85)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(o.x, o.y - 60); c.lineTo(o.x, o.y); c.stroke();
  }
  c.restore();
  drawSlot(c, 'orb:sky', o.x, o.y, 1, () => {
    c.save();
    c.fillStyle = '#1c192d';
    c.strokeStyle = '#FDE979';
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(o.x, o.y, o.r * .72, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#fff3b0';
    star4(c, o.x, o.y, 8 + Math.sin(t * 14) * 1.5);
    c.restore();
  });
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = '#7fe7ff'; c.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    const a = t * 6 + i * TAU / 3;
    c.beginPath(); c.arc(o.x, o.y, o.r * 1.05, a, a + .85); c.stroke();
  }
  c.restore();
}

/** 补给小物件：背后柔光与细光丝 + 外围脉冲圈 + 本体槽位 + 外围小星点（不挡中心）。 */
export function drawSupplyObject(c: CanvasRenderingContext2D, k: Exclude<ChestPrize, 'card'>, x: number, y: number, a: number, t: number, s = 1, haloOn = true): void {
  const col = k === 'candy' ? '#ff9ad5' : k === 'drink' ? '#6EE7B7' : k === 'mega' ? '#FDE979' : k === 'boom' ? '#ff6fa8' : '#fff1c2';
  c.save();
  c.globalAlpha *= a;
  if (haloOn) {
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(x, y - 12 * s, 0, x, y - 12 * s, 32 * s);
    halo.addColorStop(0, hexA(col, .52)); halo.addColorStop(1, hexA(col, 0));
    c.fillStyle = halo; c.fillRect(x - 32 * s, y - 44 * s, 64 * s, 64 * s);
    slimBeacon(c, x, y + 6 * s, 14 * s, 72 * s, col, .24);
    c.strokeStyle = hexA(col, .55 * (.6 + .4 * Math.sin(t * 6))); c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(x, y + 4 * s, 20 * s, 5 * s, 0, 0, TAU); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  const key: MusouObjectKey = `supply:${k}` as MusouObjectKey;
  drawSlot(c, key, x, y - 12 * s, s, () => {
    c.save();
    c.translate(x, y - 12 * s);
    c.scale(s, s);
    c.lineJoin = 'round';
    if (k === 'candy') {
      c.fillStyle = '#ffd1ea';
      c.beginPath(); c.moveTo(-9, 0); c.lineTo(-19, -7); c.lineTo(-17, 0); c.lineTo(-19, 7); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(9, 0); c.lineTo(19, -7); c.lineTo(17, 0); c.lineTo(19, 7); c.closePath(); c.fill();
      c.fillStyle = '#ff6fb5'; c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 6, -2.2, -.6); c.stroke();
    } else if (k === 'drink') {
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(2, -14); c.lineTo(7, -24); c.lineTo(12, -24); c.stroke();
      c.fillStyle = '#e8fff6'; c.beginPath(); c.moveTo(-10, -14); c.lineTo(10, -14); c.lineTo(7, 12); c.lineTo(-7, 12); c.closePath(); c.fill();
      c.fillStyle = '#34d399'; c.beginPath(); c.moveTo(-8.6, -4); c.lineTo(8.6, -4); c.lineTo(7, 12); c.lineTo(-7, 12); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(-11, -16, 22, 4);
    } else if (k === 'mega') {
      c.fillStyle = '#ffe27a';
      c.beginPath(); c.moveTo(-12, -5); c.lineTo(8, -14); c.lineTo(8, 14); c.lineTo(-12, 5); c.closePath(); c.fill();
      c.fillStyle = '#f2b93b'; c.beginPath(); c.roundRect(-17, -6, 7, 12, 2); c.fill(); c.fillRect(-6, 5, 4, 9);
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.lineCap = 'round';
      for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(10, 0, 8 + i * 6 + Math.sin(t * 8) * 1, -.7, .7); c.stroke(); }
    } else if (k === 'boom') {
      c.fillStyle = '#1b1f35'; c.beginPath(); c.roundRect(-13, -17, 26, 34, 4); c.fill();
      c.strokeStyle = '#ff6fa8'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#ff6fa8'; c.beginPath(); c.arc(0, 4, 8 + Math.sin(t * 12) * .8, 0, TAU); c.fill();
      c.fillStyle = '#1b1f35'; c.beginPath(); c.arc(0, 4, 3.5, 0, TAU); c.fill();
      c.fillStyle = '#ffb3d1'; c.beginPath(); c.arc(0, -10, 3, 0, TAU); c.fill();
    } else {
      c.globalCompositeOperation = 'lighter';
      const b = c.createLinearGradient(-14, 0, 14, 0);
      b.addColorStop(0, 'rgba(255,241,194,0)'); b.addColorStop(.5, 'rgba(255,241,194,.6)'); b.addColorStop(1, 'rgba(255,241,194,0)');
      c.fillStyle = b; c.beginPath(); c.moveTo(-5, -4); c.lineTo(5, -4); c.lineTo(14, 16); c.lineTo(-14, 16); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#3a3f5c'; c.beginPath(); c.roundRect(-9, -18, 18, 15, 4); c.fill();
      c.fillStyle = '#fff1c2'; c.beginPath(); c.ellipse(0, -3, 7, 2.5, 0, 0, TAU); c.fill();
    }
    c.restore();
  });
  if (haloOn) orbitStars(c, x, y - 12 * s, 20 * s, 14 * s, col, t * 1.3, 2);
  c.restore();
}

export function drawCymbalBody(c: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number): void {
  drawSlot(c, 'rare:cymbal', x, y, r / 15, () => {
    c.save();
    c.translate(x, y);
    c.scale(1, .45 + .15 * Math.sin(spin));
    const gr = c.createRadialGradient(-r * .3, -r * .3, 0, 0, 0, r);
    gr.addColorStop(0, '#fffbe0'); gr.addColorStop(.5, '#f2c94c'); gr.addColorStop(1, '#a07818');
    c.fillStyle = gr;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, r * .55, 0, TAU); c.stroke();
    c.fillStyle = '#7a5a10'; c.beginPath(); c.arc(0, 0, r * .14, 0, TAU); c.fill();
    c.restore();
  });
}

/** 稀有道具：外围柔光晕 + 槽位本体 + 外围微星。 */
export function drawRareObject(c: CanvasRenderingContext2D, k: RareKind, x: number, y: number, s: number, t: number, ringOn = true): void {
  const col = RARE_COLOR[k];
  c.save();
  c.globalCompositeOperation = 'lighter';
  const halo = c.createRadialGradient(x, y, 0, x, y, 36 * s);
  halo.addColorStop(0, hexA(col, .55)); halo.addColorStop(1, hexA(col, 0));
  c.fillStyle = halo; c.fillRect(x - 36 * s, y - 36 * s, 72 * s, 72 * s);
  if (ringOn) {
    c.strokeStyle = hexA(col, .6 * (.6 + .4 * Math.sin(t * 7))); c.lineWidth = 1.8;
    c.beginPath(); c.arc(x, y, 24 * s, t * 2, t * 2 + 4.4); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  const key: MusouObjectKey = `rare:${k}` as MusouObjectKey;
  if (k === 'cymbal') {
    drawCymbalBody(c, x, y, 15 * s, t * 3);
  } else {
    drawSlot(c, key, x, y, s, () => {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      c.lineJoin = 'round'; c.lineCap = 'round';
      if (k === 'tri') {
        c.strokeStyle = '#e9fbff'; c.lineWidth = 3.5;
        c.beginPath(); c.moveTo(-3, -14); c.lineTo(12, 12); c.lineTo(-12, 12); c.lineTo(-6, 2); c.stroke();
        c.strokeStyle = '#7fe7ff'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(4, -16); c.lineTo(16, -4); c.stroke();
      } else if (k === 'fire') {
        c.fillStyle = '#ff8a5c';
        c.beginPath(); c.roundRect(-7, -12, 14, 24, 3); c.fill();
        c.fillStyle = '#ffd27a'; c.fillRect(-7, -4, 14, 4); c.fillRect(-7, 4, 14, 3);
        c.strokeStyle = '#fff1c2'; c.lineWidth = 2;
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * .6; c.beginPath(); c.moveTo(Math.cos(a) * 15, -12 + Math.sin(a) * 6); c.lineTo(Math.cos(a) * 22, -14 + Math.sin(a) * 12 - Math.sin(t * 8 + i) * 2); c.stroke(); }
      } else {
        c.fillStyle = '#ff6fa8';
        c.beginPath(); c.moveTo(-11, 14); c.lineTo(11, 14); c.lineTo(6, -14); c.lineTo(-6, -14); c.closePath(); c.fill();
        c.strokeStyle = '#ffffff'; c.lineWidth = 2.5;
        const a = Math.sin(t * 6) * .5;
        c.beginPath(); c.moveTo(0, 10); c.lineTo(Math.sin(a) * 18, 10 - Math.cos(a) * 22); c.stroke();
      }
      c.restore();
    });
  }
  if (ringOn) orbitStars(c, x, y, 22 * s, 16 * s, col, t * 1.4, 2);
  c.restore();
}

/** 音符地雷：压缩倒计时环 + 本体槽位。 */
export function drawMineObject(c: CanvasRenderingContext2D, x: number, k: number): void {
  c.save();
  c.translate(x, FLOOR - 6);
  c.scale(1, .35);
  c.strokeStyle = `rgba(253,233,121,${.4 + k * .6})`; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 18 + k * 10, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
  c.restore();
  drawSlot(c, 'mine:note', x, FLOOR - 4, 1, () => {
    c.fillStyle = '#FDE979';
    noteGlyph(c, x, FLOOR - 14, 7);
  });
}

let gem: { art: HTMLImageElement | null; canvas: HTMLCanvasElement } | undefined;

/** 星屑的光晕与本体合在一张图，按 8 世界像素半径烘焙。 */
export function gemStamp(): HTMLCanvasElement {
  const art = customArt('gem:star');
  if (gem?.art === art) return gem.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d')!;
  c.setTransform(2, 0, 0, 2, 32, 32);
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(253,233,121,.25)';
  c.beginPath(); c.arc(0, 0, 8 * 1.6, 0, TAU); c.fill();
  if (art) {
    c.drawImage(art, ...slotRect(MUSOU_OBJECT_SPECS['gem:star'], art, 0, 0, 1));
  } else {
    c.fillStyle = '#fff6c4';
    star4(c, 0, 0, 8);
  }
  gem = { art, canvas };
  return canvas;
}

/** 荧光棒远程弹道：紫光外晕 + 棒体槽位。 */
export function drawMobShotObject(c: CanvasRenderingContext2D, x: number, y: number, spin: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(spin);
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(192,132,252,.35)';
  c.beginPath(); c.roundRect(-5, -16, 10, 32, 5); c.fill();
  drawSlot(c, 'shot:glow', 0, 0, 1, () => {
    c.fillStyle = '#f3e8ff';
    c.beginPath(); c.roundRect(-2.5, -12, 5, 24, 2.5); c.fill();
  });
  c.restore();
}

/** 厚甲小盾标。 */
export function drawArmorMark(c: CanvasRenderingContext2D, x: number, y: number): void {
  drawSlot(c, 'mark:armor', x, y, 1, () => {
    c.fillStyle = 'rgba(200,210,232,.9)';
    c.beginPath(); c.moveTo(x - 8, y - 7); c.lineTo(x + 8, y - 7); c.lineTo(x + 8, y + 1); c.quadraticCurveTo(x + 8, y + 8, x, y + 10); c.quadraticCurveTo(x - 8, y + 8, x - 8, y + 1); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,70,100,.9)'; c.lineWidth = 1.5; c.stroke();
  });
}

/** 应援团长挥舞应援旗 + 脚下加盾柔光圈。 */
export function drawFlagMark(c: CanvasRenderingContext2D, fx: number, bx: number, by: number, facing: number, t: number): void {
  c.save();
  drawSlot(c, 'mark:flag', bx, by + 40, 1, () => {
    const sw = Math.sin(t * 6) * .35;
    c.strokeStyle = '#d9e2f5'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(bx, by + 40); c.lineTo(bx + Math.sin(sw) * 70, by - 70); c.stroke();
    const tx = bx + Math.sin(sw) * 70, ty = by - 70;
    const gr = c.createLinearGradient(tx, ty, tx - facing * 70, ty);
    gr.addColorStop(0, '#9ff3ff'); gr.addColorStop(1, '#4fb6ff');
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(tx, ty);
    for (let k = 0; k <= 6; k++) c.lineTo(tx - facing * k * 12, ty + Math.sin(t * 9 + k) * 4);
    for (let k = 6; k >= 0; k--) c.lineTo(tx - facing * k * 12 + Math.sin(sw) * 6, ty + 34 + Math.sin(t * 9 + k + 1) * 4);
    c.closePath(); c.fill();
  });
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(159,243,255,.08)';
  c.beginPath(); c.ellipse(fx, FLOOR, 260, 30, 0, 0, TAU); c.fill();
  c.restore();
}

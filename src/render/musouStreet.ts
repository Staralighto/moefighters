import type { ImageCache } from '../assets/loader.ts';
import { FLOOR } from '../game/constants.ts';
import type { MusouDirector } from '../musou/director.ts';
import { STREET_ART, STREET_LAYERS } from '../musou/placeholders.ts';
import { TAGS, type SongTag } from '../musou/songs.ts';
import { reducedMotion } from '../ui/motion.ts';
import { isLiteFx } from './fxQuality.ts';
import type { CamView } from './musouCam.ts';
import { BRIDGE_DECK, crowdHost, drawFeverCrowd } from './musouJuice.ts';

/* 音浪无双的蒸汽波长街（docs/musou-items.md、GPT 生图规格总表）：
   - 天空、蒸汽波太阳、星星、地面霓虹网格：代码画，按曲风配色，网格跟拍推进；
   - 远景天际线 / 中景霓虹楼 / 近景街景：GPT 图（public/musou/bg/），每层拆成「楼体」和「霓虹遮罩」两张，
     遮罩按曲风染色后盖上去，拍点上一亮、FEVER 全亮；换歌时新旧两套颜色交叉淡化。
   视差系数按图宽自动换算：图越宽走得越快（远景几乎不动，近景约 0.7）。素材没加载完时返回 false，由占位长街兜底。 */

const W = 960, H = 540;
const STREET_MAX = 1920;
/** 整条长街压暗多少（让角色、小怪、道具在前面跳出来）；霓虹基础亮度。 */
const STREET_DIM = .3;
const NEON_BASE = .62;
/** 关键节点（FEVER 开场、Boss 登场、大招、换歌、击破里程碑、满热度）背景整体提亮回原亮度的霓虹值。 */
const NEON_FLARE = .78;
/** 背景整体上移多少：人物精灵的脚底比判定地面线略高，地面网格的地平线对齐到脚底。 */
const GROUND_SHIFT = 12;

/** 提亮：触发时拉满，约 1.3 秒退回；放大招期间一直保持。 */
const flare = { k: 0, t: -1, fever: -1, boss: null as unknown, phase: '', milestone: -9, boil: false, pulses: 0, anomaly: null as unknown };
function stepFlare(m: MusouDirector, t: number): number {
  const dt = flare.t < 0 ? 0 : Math.max(0, Math.min(.1, t - flare.t));
  flare.t = t;
  let hit = 0;
  if (m.fever >= 0 && flare.fever < 0) hit = 1;
  if (m.boss && m.boss !== flare.boss) hit = 1;
  if (m.phase === 'shift' && flare.phase !== 'shift') hit = 1;
  if (m.anomaly && m.anomaly !== flare.anomaly) hit = 1;
  if (m.milestoneAt !== flare.milestone && m.elapsed - m.milestoneAt < .2) hit = Math.max(hit, .8);
  if (m.boil && !flare.boil) hit = Math.max(hit, .8);
  let big = 0;
  for (const p of m.pulses) if (p.k === 'ult' || p.k === 'mega' || p.k === 'fever') big++;
  if (big > flare.pulses) hit = 1;
  flare.fever = m.fever; flare.boss = m.boss; flare.phase = m.phase; flare.milestone = m.milestoneAt; flare.boil = m.boil; flare.pulses = big; flare.anomaly = m.anomaly;
  flare.k = Math.max(hit, flare.k - dt / 1.3, m.ultOn ? .9 : 0);
  return flare.k * flare.k * (3 - 2 * flare.k);
}
type LayerId = typeof STREET_LAYERS[number];

interface Sky { top: string; mid: string; horizon: string; sun: [string, string]; floor: string; grid: string }
const SKY: Record<SongTag, Sky> = {
  hot: { top: '#12061f', mid: '#3d0f45', horizon: '#ff5a3c', sun: ['#ffe066', '#ff2e88'], floor: '#14061a', grid: '#ff2e88' },
  dark: { top: '#03040f', mid: '#0d0b2e', horizon: '#3b1a7a', sun: ['#9c87ff', '#2b1a6e'], floor: '#05040f', grid: '#8f6bff' },
  cute: { top: '#2a1d55', mid: '#7a4fa8', horizon: '#ffb3dd', sun: ['#fff6fb', '#ff7ad6'], floor: '#2a1640', grid: '#ff6fd0' },
  epic: { top: '#081430', mid: '#2a2a5a', horizon: '#ffb347', sun: ['#fff1c2', '#ff8a5c'], floor: '#0d0f24', grid: '#ffd76a' },
};
/** 每层霓虹的上 / 下两色（取曲风的配色）。 */
function neonPair(tag: SongTag, id: LayerId): [string, string] {
  const md = TAGS[tag].mood;
  return id === 'far' ? [md.c2, md.c1] : id === 'mid' ? [md.f1, md.f2] : [md.f2, md.f1];
}

/** 染好色的霓虹层：只留当前和上一首曲风的，免得手机上占太多内存。 */
const tinted = new Map<string, HTMLCanvasElement>();
function tintedNeon(id: LayerId, tag: SongTag, mask: HTMLImageElement): HTMLCanvasElement {
  const key = `${id}|${tag}`;
  let cv = tinted.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = mask.naturalWidth; cv.height = mask.naturalHeight;
  const g = cv.getContext('2d')!;
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  const [a, b] = neonPair(tag, id);
  const gr = g.createLinearGradient(0, 120, 0, FLOOR);
  gr.addColorStop(0, a); gr.addColorStop(1, b);
  g.fillStyle = gr;
  g.fillRect(0, 0, cv.width, cv.height);
  tinted.set(key, cv);
  return cv;
}

/** 楼体压暗烘在原图上，保留楼缝透明；节拍提亮由霓虹层表现。 */
const bodies = new Map<LayerId, HTMLCanvasElement>();
function shadedBody(id: LayerId, body: HTMLImageElement): HTMLCanvasElement {
  const cached = bodies.get(id);
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = body.naturalWidth; cv.height = body.naturalHeight;
  const g = cv.getContext('2d')!;
  g.drawImage(body, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = STREET_DIM + (id === 'far' ? .2 : 0);
  g.fillStyle = '#06040f';
  g.fillRect(0, 0, cv.width, cv.height);
  bodies.set(id, cv);
  return cv;
}

const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const hexA = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
const mixHex = (a: string, b: string, k: number) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const t = Math.max(0, Math.min(1, k));
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
};

const STARS = Array.from({ length: 70 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1) * (W + 200) - 100, y: r(2) * FLOOR * .62, s: .6 + r(3) * 1.4, p: r(4) * 6.28 };
});

function drawSky(c: CanvasRenderingContext2D, sky: Sky, x0: number, vw: number, top: number, a: number, sunK: number): void {
  c.globalAlpha = a;
  const gr = c.createLinearGradient(0, Math.min(0, top), 0, FLOOR);
  gr.addColorStop(0, sky.top); gr.addColorStop(.55, sky.mid); gr.addColorStop(1, sky.horizon);
  c.fillStyle = gr;
  c.fillRect(x0, top, vw, FLOOR - top + 1);
  if (sunK > .01) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const sg = c.createLinearGradient(0, Math.min(0, top), 0, FLOOR);
    sg.addColorStop(0, hexA('#ff8a3a', .08 * sunK));
    sg.addColorStop(.55, hexA('#ffb347', .18 * sunK));
    sg.addColorStop(1, hexA('#ff4a28', .35 * sunK));
    c.fillStyle = sg;
    c.fillRect(x0, top, vw, FLOOR - top + 1);
    c.restore();
  }
  c.globalAlpha = 1;
}

function drawStars(c: CanvasRenderingContext2D, scrollX: number, t: number, a: number): void {
  if (a <= .005) return;
  c.fillStyle = '#ffffff';
  for (const s of STARS) {
    c.globalAlpha = a * (.35 + .45 * Math.sin(t * 1.7 + s.p) ** 2);
    const x = s.x - scrollX * .01;
    c.fillRect(x, s.y, s.s, s.s);
  }
  c.globalAlpha = 1;
}

/** 蒸汽波太阳：上亮下暗的圆，下半截被一道道越来越粗的横缝切开；FEVER 时横缝往下流，烈日异象时膨胀占满天际线。 */
function drawSun(c: CanvasRenderingContext2D, sky: Sky, scrollX: number, t: number, fever: number, a: number, sunK: number, pulse: number, reduced: boolean): void {
  const cx = 600 - scrollX * .03;
  const cy = FLOOR - 140 - 18 * sunK;
  const r = 108 + 172 * sunK;
  const cTop = sunK > .01 ? mixHex(sky.sun[0], '#fffbe0', sunK) : sky.sun[0];
  const cBot = sunK > .01 ? mixHex(sky.sun[1], '#ff4a28', sunK) : sky.sun[1];
  const breath = sunK > .01 && !reduced ? 1 + .05 * pulse * sunK : 1;
  c.save();
  c.globalAlpha = a;
  c.globalCompositeOperation = 'lighter';
  const halo = c.createRadialGradient(cx, cy, r * .6, cx, cy, r * (1.9 + .32 * sunK) * breath);
  halo.addColorStop(0, hexA(cBot, .5 + .22 * sunK)); halo.addColorStop(1, hexA(cBot, 0));
  c.fillStyle = halo;
  c.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
  if (sunK > .02) {
    const corona = c.createRadialGradient(cx, cy, r * .85, cx, cy, r * 1.45 * breath);
    corona.addColorStop(0, hexA('#fff4c8', .4 * sunK));
    corona.addColorStop(.5, hexA('#ff9a3c', .22 * sunK));
    corona.addColorStop(1, hexA('#ff4a28', 0));
    c.fillStyle = corona;
    c.fillRect(cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2);
  }
  c.globalCompositeOperation = 'source-over';
  c.beginPath(); c.rect(cx - r - 2, cy - r - 2, r * 2 + 4, FLOOR - (cy - r) + 2); c.clip();
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
  const gr = c.createLinearGradient(0, cy - r, 0, cy + r);
  gr.addColorStop(0, cTop); gr.addColorStop(1, cBot);
  c.fillStyle = gr;
  const band = 18 + 8 * sunK, split = cy - r * (.05 - .22 * sunK);
  const flow = (t * (reduced ? 3 : 6 + fever * 30 + sunK * 14)) % band;
  c.beginPath();
  c.rect(cx - r, cy - r, r * 2, split - (cy - r));
  for (let yy = split - band + flow; yy < cy + r; yy += band) {
    const k = Math.max(0, (yy - split) / r);
    const gap = (2 + k * 9) * (1 - .42 * sunK);
    const y = Math.max(yy, split), h = yy + band - gap - y;
    if (h > 0) c.rect(cx - r, y, r * 2, h);
  }
  c.fill();
  c.restore();
}

/** 地面：深色地板 + 透视霓虹网格，横线每拍朝镜头推进一格，竖线跟着长街卷动。 */
function drawFloor(c: CanvasRenderingContext2D, sky: Sky, x0: number, vw: number, bottom: number, scrollX: number, beat: number, inten: number, a: number, sunK: number): void {
  c.globalAlpha = a;
  c.fillStyle = sky.floor;
  c.fillRect(x0, FLOOR, vw, bottom - FLOOR);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const hzCol = sunK > .01 ? mixHex(sky.horizon, '#ff9040', sunK * .75) : sky.horizon;
  const gridCol = sunK > .01 ? mixHex(sky.grid, '#ffb85c', sunK * .65) : sky.grid;
  const hz = c.createLinearGradient(0, FLOOR - 26, 0, FLOOR + 10);
  hz.addColorStop(0, hexA(hzCol, 0)); hz.addColorStop(.75, hexA(hzCol, (.5 + .22 * sunK) * inten)); hz.addColorStop(1, hexA(hzCol, 0));
  c.fillStyle = hz;
  c.fillRect(x0, FLOOR - 26, vw, 36);
  c.strokeStyle = hexA(gridCol, (.5 + .15 * sunK) * inten * a);
  c.lineWidth = 1.5;
  const depth = bottom - FLOOR;
  c.beginPath();
  for (let j = 0; j < 7; j++) {
    const y = FLOOR + depth * ((j + beat) / 7) ** 2.1;
    c.moveTo(x0, y); c.lineTo(x0 + vw, y);
  }
  const vx = W / 2, vy = FLOOR - 60, step = 90, sh = scrollX % step;
  for (let i = -16; i <= 16; i++) {
    const xb = vx + (i * step - sh) * 2.4;
    const xt = vx + (xb - vx) * (FLOOR - vy) / (bottom - vy);
    c.moveTo(xt, FLOOR); c.lineTo(xb, bottom);
  }
  c.stroke();
  c.restore();
  c.globalAlpha = 1;
}

/** 霓虹天桥：横跨长街、和人群同一视差（0.6）。平时只亮一点；FEVER 开场时灯带从画面中线向两边一路点亮，
    人群从栏板后面站起来挥荧光棒。桥身是简单几何，霓虹按曲风染色、按拍闪。 */
const BRIDGE_PAR = .6;
function bridgeBack(c: CanvasRenderingContext2D, m: MusouDirector, x0: number, vw: number): void {
  const deckBot = BRIDGE_DECK + 10, sp = 240;
  const off = -((m.scrollX * BRIDGE_PAR) % sp);
  c.fillStyle = '#17142f';
  for (let x = off - sp; x < x0 + vw + sp; x += sp) {
    if (x < x0 - 40) continue;
    c.fillRect(x - 7, deckBot, 14, FLOOR - deckBot);
    c.fillRect(x - 12, FLOOR - 6, 24, 6);
  }
}
function bridgeFront(c: CanvasRenderingContext2D, m: MusouDirector, x0: number, vw: number, pulse: number, fever: number, flareK: number): void {
  const md = TAGS[m.mood].mood;
  const railTop = BRIDGE_DECK - 16, deckTop = BRIDGE_DECK, deckBot = BRIDGE_DECK + 10;
  const off = -((m.scrollX * BRIDGE_PAR) % 60);
  // 栏板：半透明深色玻璃 + 立柱；甲板：实心。
  c.fillStyle = 'rgba(28,24,66,.72)';
  c.fillRect(x0, railTop, vw, deckTop - railTop);
  c.fillStyle = '#2c2760';
  for (let x = off - 60; x < x0 + vw + 60; x += 60) if (x >= x0 - 4) c.fillRect(x - 1.5, railTop, 3, deckTop - railTop);
  c.fillStyle = '#211d45';
  c.fillRect(x0, deckTop, vw, deckBot - deckTop);
  // 霓虹：扶手一条、甲板底边一条。FEVER 进来时从中线向两边点亮。
  const wipe = (W / 2 + 260) * (1 - (1 - fever) ** 3);
  const base = .28 + .3 * flareK + .18 * m.grooveK;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const line = (y: number, col: string, lit: number) => {
    for (const [w, a] of [[8, .22], [2.5, 1]] as const) {
      c.lineWidth = w;
      c.strokeStyle = hexA(col, base * a * (.85 + .15 * pulse));
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + vw, y); c.stroke();
      if (lit > 0) {
        c.strokeStyle = hexA(col, (1 - base) * a * lit * (.8 + .2 * pulse));
        c.beginPath(); c.moveTo(W / 2 - wipe, y); c.lineTo(W / 2 + wipe, y); c.stroke();
      }
    }
  };
  line(railTop, md.f1, fever);
  line(deckBot, md.f2, fever);
  c.restore();
}

/** 画整条长街；素材没齐时返回 false。 */
export function drawVaporStreet(c: CanvasRenderingContext2D, m: MusouDirector, cam: CamView, t: number, images: ImageCache): boolean {
  const layers = STREET_LAYERS.map((id, i) => ({ id, body: images.get(STREET_ART[i]), neon: images.get(`/musou/bg/${id}-neon.png`) }));
  if (layers.some(l => !l.body || !l.neon) || typeof document === 'undefined') { crowdHost.street = false; return false; }
  crowdHost.street = true;
  const x0 = cam.fx - (W / 2 + cam.ox) / cam.z - 4, vw = W / cam.z + 8;
  const y0 = cam.fy - (cam.fy + cam.oy) / cam.z, y1 = cam.fy + (H - cam.fy - cam.oy) / cam.z;
  const top = Math.min(0, y0 - 4), bottom = Math.max(H, y1 + 4);
  const to = m.mood;
  const from = m.phase === 'shift' ? m.prevMood : m.mood;
  for (const key of tinted.keys()) if (!key.endsWith('|' + to) && !key.endsWith('|' + from)) tinted.delete(key);
  const k = m.phase === 'shift' ? Math.max(0, Math.min(1, (m.shiftT - 1) / .6)) : 1;
  const mixes: [SongTag, number][] = from === to || k >= 1 ? [[to, 1]] : k <= 0 ? [[from, 1]] : [[from, 1], [to, k]];
  const fever = m.feverK;
  const beat = m.beatFrac();
  const pulse = (1 - beat) ** 2;
  const fl = stepFlare(m, t);
  const rk = m.anomaly?.kind === 'sun' ? m.anomaly.k : 0;
  const sunK = rk * rk * (3 - 2 * rk);
  const reduced = reducedMotion();
  const lite = isLiteFx();
  const inten = Math.min(1, NEON_BASE + (NEON_FLARE - NEON_BASE) * fl + .2 * pulse + .25 * fever);

  c.save();
  c.translate(0, -GROUND_SHIFT);
  // 天空、地面的压暗随演出变化，太阳从楼缝和楼顶上方露出来。
  const dimA = STREET_DIM * (1 - .35 * fever) * (1 - fl) * (1 - .32 * sunK);
  const dimFill = (y: number, h: number) => { c.fillStyle = `rgba(6,4,16,${dimA})`; c.fillRect(x0, y, vw, h); };
  for (const [tag, a] of mixes) {
    drawSky(c, SKY[tag], x0, vw, top, a, sunK);
    drawStars(c, m.scrollX, t, a * (tag === 'cute' || tag === 'epic' ? .45 : 1) * (1 - sunK * .92));
  }
  dimFill(top, FLOOR - top + 1);
  for (const [tag, a] of mixes) {
    const sunA = tag === 'dark' ? .6 + .4 * sunK : 1;
    drawSun(c, SKY[tag], m.scrollX, t, fever, a * sunA, sunK, pulse, reduced);
  }
  for (const l of layers) {
    const body = l.body!, mask = l.neon!;
    const f = Math.max(0, (body.naturalWidth - W) / STREET_MAX);
    const ox = Math.round(m.scrollX * f);
    if (l.id === 'near') {
      for (const [tag, a] of mixes) drawFloor(c, SKY[tag], x0, vw, bottom + GROUND_SHIFT, m.scrollX, beat, inten, a, sunK);
      dimFill(FLOOR, bottom + GROUND_SHIFT - FLOOR);
      // 天桥在中景和近景之间：先桥墩，再人群（站在甲板上），最后栏板和霓虹挡住人群下半身。
      bridgeBack(c, m, x0, vw);
      drawFeverCrowd(c, m, t);
      bridgeFront(c, m, x0, vw, pulse, fever, fl);
    }
    c.drawImage(shadedBody(l.id, body), -ox, 0);
    const base = inten * (l.id === 'far' ? .7 : 1);
    const glow = (.18 * pulse + .3 * fever) * (l.id === 'far' ? .4 : 1);
    for (const [tag, a] of mixes) {
      const neon = tintedNeon(l.id, tag, mask);
      c.globalAlpha = a * (1 - dimA) * (lite ? Math.min(1, base + glow) : base);
      c.drawImage(neon, -ox, 0);
      if (!lite) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = a * (1 - dimA) * glow;
        c.drawImage(neon, -ox, 0);
        c.globalCompositeOperation = 'source-over';
      }
    }
    c.globalAlpha = 1;
  }
  c.restore();
  return true;
}

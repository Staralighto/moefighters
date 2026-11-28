import { assetUrl } from '../assets/loader.ts';
import { drawDropsUi } from './musouDrops.ts';
import { FLOOR } from '../game/constants.ts';
import type { Fighter } from '../game/fighter.ts';
import type { FightGame } from '../game/game.ts';
import { heatColor, liftH, RARE_COLOR } from '../musou/constants.ts';
import type { Charge, Chest, ChestPrize, Giant, GrooveMove, LaserNet, Lift, MusouDirector, Ring, SkyOrb, SkyPadChain, SpotlightSolo, StageBall } from '../musou/director.ts';
import { TAGS } from '../musou/songs.ts';
import { isLiteFx } from './fxQuality.ts';
import { reducedMotion } from '../ui/motion.ts';
import type { CamView } from './musouCam.ts';
import { UI_FONT } from './fx.ts';
import {
  drawArmorMark, drawChestObject, drawCymbalBody, drawFlagMark, drawGiantObject,
  drawLaserNodeObject, drawLiftObject, drawRareObject, drawSkyOrbObject, drawSupplyObject,
} from './musouObjects.ts';

/* 音浪无双 P0 的画面：副歌 FEVER（变色灯光、挥荧光棒的人群）、精英预警与血条、宝箱光柱和轮盘、补给、舞台追光、
   全屏冲击（大招清场 / 爆音音箱 / 扩音器）、受伤泛红。
   光一律是伊泽枣月光柱那一路：顶窄底宽、中轴最亮、横向渐隐到透明，落点一圈柔光；不叠色块、不用 shadowBlur。 */

const W = 960, H = 540;
const TAU = Math.PI * 2;

const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const hexA = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${Math.max(0, a)})`; };
const ease = (k: number) => 1 - (1 - k) ** 3;

/** 月光柱：从天顶 topY 落到地面 x，顶宽 top、底宽 bottom；pass 'back' 画柱和落点光池，'front' 只画一层很淡的柱身（照亮人）。 */
export function softPillar(c: CanvasRenderingContext2D, x: number, color: string, a: number, top = 40, bottom = 120, pass: 'back' | 'front' = 'back', t = 0, motes = 0): void {
  if (a <= .005) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createLinearGradient(x - bottom, 0, x + bottom, 0);
  gr.addColorStop(0, hexA(color, 0));
  gr.addColorStop(.5, hexA(color, a * (pass === 'back' ? .34 : .12)));
  gr.addColorStop(1, hexA(color, 0));
  c.fillStyle = gr;
  c.beginPath();
  c.moveTo(x - top, 0); c.lineTo(x + top, 0); c.lineTo(x + bottom, FLOOR); c.lineTo(x - bottom, FLOOR);
  c.closePath(); c.fill();
  if (pass === 'back') {
    const pool = c.createRadialGradient(x, FLOOR, 4, x, FLOOR, bottom * 1.15);
    pool.addColorStop(0, hexA(color, a * .45));
    pool.addColorStop(1, hexA(color, 0));
    c.fillStyle = pool;
    c.beginPath(); c.ellipse(x, FLOOR, bottom * 1.15, bottom * .26, 0, 0, TAU); c.fill();
    if (motes) {
      c.fillStyle = hexA('#ffffff', a * .7);
      for (let i = 0; i < motes; i++) {
        const u = (i * .37 + t * (.3 + (i % 3) * .1)) % 1;
        const mx = x + Math.sin(i * 2.3 + t * 1.7) * (top + (bottom - top) * u) * .6;
        c.beginPath(); c.arc(mx, u * FLOOR, 1.5 + (i % 2), 0, TAU); c.fill();
      }
    }
  }
  c.restore();
}

/* ---------------- 长街之上、人物之下 ---------------- */

export function drawJuiceBack(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  ensureSlamSheet();
  const t = g.age;
  if (m.feverK > .01) feverBack(c, m, t);
  // 舞台追光：一束暖白月光柱跟着主角。
  const lead = g.fighters[0];
  if (m.spotT > 0 && lead) softPillar(c, lead.x, '#fff1c2', Math.min(1, m.spotT / .3, (6 - m.spotT) / .25 + .2) * 1.1, 34, 110, 'back', t, 7);
  // 放 L：四周压暗一层，她身上落下一束角色色的月光柱，场上被定住的人群都在暗处——这一招是全场的。
  if (m.ultOn && lead) {
    const k = Math.min(1, (lead.attack?.t ?? 0) / .15);
    c.save(); c.fillStyle = `rgba(4,6,20,${.38 * k})`; c.fillRect(-260, -260, W + 520, H + 520); c.restore();
    softPillar(c, lead.x, lead.data.color, 1.25 * k, 40, 140, 'back', t, 10);
  }
  if (m.solo) soloBack(c, m.solo, lead, t);
  for (const p of m.pulses) if (p.k === 'impact') impactGround(c, p.x, p.y, p.t / p.max, p.color, p.seed ?? 1, !!p.big, p.n ?? 0);
  for (const l of m.lifts) liftFx(c, l, t, TAGS[m.song.tag].mood.f2);
  for (const gi of m.giants) giantFx(c, m, gi, t);
  if (m.ring) ringBack(c, m.ring, t);
  for (const ch of m.charges) laneBack(c, ch, t);
  if (lead && lead.hp > 0 && m.phase !== 'shift') beatRing(c, m, lead.x);
  for (const ch of m.chests) chestBack(c, ch, t);
  for (const w of m.warns) warnBack(c, w.x, w.r, w.t, w.max, t);
  for (const f of g.fighters) if (f.mob?.elite && f.hp > 0 && f.mob.elite.windup > 0) eliteWarn(c, f);
}

/** FEVER：顶上一层变色光、四束跟着拍子扫的光柱、背景一排挥荧光棒的人。 */
function feverBack(c: CanvasRenderingContext2D, m: MusouDirector, t: number): void {
  const k = ease(m.feverK);
  const mood = TAGS[m.song.tag].mood;
  const big = m.feverBig ? 1.35 : 1;
  const beat = t * m.bpm / 60;
  // 先把背景压暗一层，前面的人和光才跳得出来。
  c.save(); c.fillStyle = `rgba(6,4,16,${.22 * k})`; c.fillRect(-260, -260, W + 520, H + 520); c.restore();
  // 两种颜色按小节交替（柔和地过渡，不闪）。
  const mix = .5 + .5 * Math.sin(beat * Math.PI / 4);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const wash = c.createLinearGradient(0, 0, 0, H * .7);
  wash.addColorStop(0, hexA(mood.f1, .2 * k * mix * big));
  wash.addColorStop(1, hexA(mood.f1, 0));
  c.fillStyle = wash; c.fillRect(-260, -260, W + 520, H * .7 + 260);
  const wash2 = c.createLinearGradient(0, 0, 0, H * .7);
  wash2.addColorStop(0, hexA(mood.f2, .18 * k * (1 - mix) * big));
  wash2.addColorStop(1, hexA(mood.f2, 0));
  c.fillStyle = wash2; c.fillRect(-260, -260, W + 520, H * .7 + 260);
  c.restore();
  // 四束舞台光：两两对扫，和拍子同步摆动。
  for (let i = 0; i < 4; i++) {
    const x0 = 130 + i * 233;
    const sw = Math.sin(beat * Math.PI / 2 + i * 1.7) * .38;
    tiltBeam(c, x0, sw, 12, 95 * big, i % 2 ? mood.f2 : mood.f1, .16 * k * big);
  }
  // 蒸汽波长街在画时，人群改由长街画在天桥上（musouStreet.ts），这里不再重复画。
  if (!crowdHost.street) crowd(c, m, t, beat, k, mood.f1, mood.f2);
}

/** 长街接管人群时置 true（每帧由 musouStreet.ts 写）。 */
export const crowdHost = { street: false };
/** 天桥甲板顶面的高度（人群站在这上面，剪影只画到这条线为止）。 */
export const BRIDGE_DECK = FLOOR - 90;

/** 给长街调用：在天桥上画挥荧光棒的人群，只画甲板以上（FEVER 升起时像从栏杆后面站起来）。 */
export function drawFeverCrowd(c: CanvasRenderingContext2D, m: MusouDirector, t: number): void {
  const k = ease(m.feverK);
  if (k <= .001) return;
  const mood = TAGS[m.song.tag].mood;
  c.save();
  c.beginPath(); c.rect(-400, -400, W + 800, BRIDGE_DECK + 400); c.clip();
  crowd(c, m, t, t * m.bpm / 60, k, mood.f1, mood.f2);
  c.restore();
}

function tiltBeam(c: CanvasRenderingContext2D, x0: number, ang: number, top: number, bottom: number, color: string, a: number): void {
  const len = FLOOR / Math.cos(ang);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(x0, -10);
  c.rotate(-ang);
  const gr = c.createLinearGradient(-bottom, 0, bottom, 0);
  gr.addColorStop(0, hexA(color, 0));
  gr.addColorStop(.5, hexA(color, a));
  gr.addColorStop(1, hexA(color, 0));
  c.fillStyle = gr;
  c.beginPath(); c.moveTo(-top, 0); c.lineTo(top, 0); c.lineTo(bottom, len); c.lineTo(-bottom, len); c.closePath(); c.fill();
  c.restore();
}

/** 一颗柔光点（荧光棒棒尖），每种颜色只烘一次，省掉每帧几十个渐变。 */
const dots = new Map<string, HTMLCanvasElement>();
function glowDot(color: string): HTMLCanvasElement {
  let cv = dots.get(color);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const x = cv.getContext('2d');
  if (x) {
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(1, hexA(color, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  }
  dots.set(color, cv);
  return cv;
}

/** 背景人群：一排暗色的头和肩，荧光棒跟着拍子左右挥，棒尖一点柔光。FEVER 进来时从下往上升起。 */
const CROWD_N = 30;
function crowd(c: CanvasRenderingContext2D, m: MusouDirector, t: number, beat: number, k: number, c1: string, c2: string): void {
  const baseY = FLOOR - 128 + (1 - k) * 60;
  const span = W + 200;
  const off = -((m.scrollX * .6) % (span / CROWD_N));
  c.save();
  c.globalAlpha = Math.min(1, k * 1.2);
  // 先画人：深色剪影，后排略小。
  c.fillStyle = 'rgba(12,10,24,.82)';
  for (let i = 0; i < CROWD_N; i++) {
    const x = off + i * span / CROWD_N - 90;
    const hop = Math.max(0, Math.sin(beat * Math.PI + i * 1.3)) * 5 * k;
    const y = baseY + (i % 3) * 4 - hop;
    const s = .9 + (i % 4) * .06;
    c.beginPath();
    c.arc(x, y, 9 * s, 0, TAU);
    c.moveTo(x - 18 * s, y + 34);
    c.quadraticCurveTo(x - 17 * s, y + 10, x, y + 10);
    c.quadraticCurveTo(x + 17 * s, y + 10, x + 18 * s, y + 34);
    c.fill();
  }
  // 再画荧光棒：棒身一条线，棒尖柔光。
  c.globalCompositeOperation = 'lighter';
  c.lineCap = 'round';
  for (let i = 0; i < CROWD_N; i++) {
    const x = off + i * span / CROWD_N - 90;
    const y = baseY + (i % 3) * 4 + 4;
    const ang = Math.sin(beat * Math.PI + i * .55) * .7;
    const hand = i % 2 ? 12 : -12;
    const len = 30;
    const tx = x + hand + Math.sin(ang) * len, ty = y - Math.cos(ang) * len;
    const col = i % 3 === 0 ? '#ffffff' : i % 2 ? c1 : c2;
    c.strokeStyle = hexA(col, .75 * k); c.lineWidth = 3;
    c.beginPath(); c.moveTo(x + hand, y); c.lineTo(tx, ty); c.stroke();
    c.globalAlpha = Math.min(1, k * 1.2) * .55 * k;
    c.drawImage(glowDot(col), tx - 16, ty - 16, 32, 32);
    c.globalAlpha = Math.min(1, k * 1.2);
  }
  c.restore();
  void t;
}

/** 脚下的拍点圈：一圈固定的目标环，一圈从外往里收的光环，收到目标环上那一刻就是拍点。热度越高颜色越暖、脚下光池越亮。 */
function beatRing(c: CanvasRenderingContext2D, m: MusouDirector, x: number): void {
  const u = m.beatFrac();
  const col = heatColor(m.heat);
  const y = FLOOR - 2;
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (m.heat > 0) {
    const pool = c.createRadialGradient(x, y, 0, x, y, 70);
    pool.addColorStop(0, hexA(col, .08 + m.heat * .045));
    pool.addColorStop(1, hexA(col, 0));
    c.fillStyle = pool;
    c.beginPath(); c.ellipse(x, y, 70, 15, 0, 0, TAU); c.fill();
  }
  c.translate(x, y);
  c.scale(1, .22);
  // 拍点刚过：目标环亮一下。
  const flash = Math.max(0, 1 - u * 5);
  c.strokeStyle = hexA(col, .28 + flash * .5);
  c.lineWidth = 3 + flash * 3;
  c.beginPath(); c.arc(0, 0, 42, 0, TAU); c.stroke();
  // 收拢环：半拍以后才出现，越近越亮。
  if (u > .35) {
    const v = (u - .35) / .65;
    c.strokeStyle = hexA(col, .15 + .55 * v);
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, 42 + 70 * (1 - v), 0, TAU); c.stroke();
  }
  c.restore();
}

/** 围堵圈：两堵人墙的位置各立一道红色月光帘，圈里地面随收紧越来越红。 */
function ringBack(c: CanvasRenderingContext2D, r: Ring, t: number): void {
  const form = r.phase === 'form' ? Math.min(1, r.t / 1.6) : 1;
  const tight = r.phase === 'close' ? Math.max(0, 1 - (r.R - 70) / 230) : 0;
  for (const side of [-1, 1]) {
    if ((side < 0 ? r.left : r.right).length === 0) continue;
    softPillar(c, r.cx + side * r.R, '#ff5a78', (.55 + .35 * tight) * form * (.85 + .15 * Math.sin(t * 6)), 14, 46);
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createLinearGradient(r.cx - r.R, 0, r.cx + r.R, 0);
  const a = (.08 + .22 * tight) * form;
  gr.addColorStop(0, `rgba(255,80,110,${a * 1.6})`);
  gr.addColorStop(.5, `rgba(255,80,110,${a * .5})`);
  gr.addColorStop(1, `rgba(255,80,110,${a * 1.6})`);
  c.fillStyle = gr;
  c.beginPath(); c.ellipse(r.cx, FLOOR, r.R, 20, 0, 0, TAU); c.fill();
  c.restore();
}

/** 横幅冲锋的预警：整条冲锋道在地上亮起，一串箭头光往冲锋方向流。 */
function laneBack(c: CanvasRenderingContext2D, ch: Charge, t: number): void {
  if (ch.phase !== 'warn' || ch.broken >= 0) return;
  const k = Math.min(1, ch.t / .3) * (.8 + .2 * Math.sin(t * 14));
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createLinearGradient(0, FLOOR - 26, 0, FLOOR + 10);
  gr.addColorStop(0, 'rgba(255,210,63,0)');
  gr.addColorStop(.6, `rgba(255,190,60,${.22 * k})`);
  gr.addColorStop(1, 'rgba(255,210,63,0)');
  c.fillStyle = gr;
  c.fillRect(-260, FLOOR - 26, W + 520, 36);
  c.fillStyle = `rgba(255,230,150,${.5 * k})`;
  const sp = 70, off = ((t * 260 * ch.dir) % sp + sp) % sp;
  for (let x = -sp + off; x < W + sp; x += sp) {
    const d = ch.dir;
    c.beginPath();
    c.moveTo(x, FLOOR - 14); c.lineTo(x + d * 14, FLOOR - 7); c.lineTo(x, FLOOR);
    c.lineTo(x + d * 6, FLOOR - 7); c.closePath(); c.fill();
  }
  c.restore();
}

/** 横幅：两根杆子之间一条两色渐变的长幅，上下沿白色细边，表面一道慢慢走的高光；撕开后两半各自飞走淡出。 */
export function drawBanner(c: CanvasRenderingContext2D, m: MusouDirector, ch: Charge, x0: number, x1: number, top: number, t: number): void {
  const mood = TAGS[m.song.tag].mood;
  const h = 30;
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  const wave = (x: number) => Math.sin(x * .05 + t * 9) * 3;
  const piece = (a: number, b: number, dx: number, dy: number, rot: number, alpha: number) => {
    c.save();
    c.globalAlpha *= alpha;
    c.translate((a + b) / 2 + dx, top + dy);
    c.rotate(rot);
    const w = b - a;
    const gr = c.createLinearGradient(-w / 2, 0, w / 2, 0);
    gr.addColorStop(0, mood.f1); gr.addColorStop(1, mood.f2);
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(-w / 2, wave(a));
    for (let x = -w / 2; x <= w / 2; x += 12) c.lineTo(x, wave(x + a + w / 2));
    for (let x = w / 2; x >= -w / 2; x -= 12) c.lineTo(x, h + wave(x + a + w / 2));
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.stroke();
    // 表面高光。
    c.globalCompositeOperation = 'lighter';
    const sx = ((t * 160) % (w + 80)) - w / 2 - 40;
    const sh = c.createLinearGradient(sx - 30, 0, sx + 30, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.35)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(-w / 2, -4, w, h + 8);
    c.restore();
  };
  if (ch.broken < 0) piece(lo, hi, 0, 0, 0, 1);
  else {
    const k = ch.broken;
    const mid = (lo + hi) / 2;
    piece(lo, mid, -k * 160, -k * 120 + k * k * 300, -k * 2.4, Math.max(0, 1 - k / 1.1));
    piece(mid, hi, k * 160, -k * 150 + k * k * 300, k * 2.1, Math.max(0, 1 - k / 1.1));
  }
}

/** 灯架预警：地上一圈暖光由淡变亮，头顶一束细光柱指出落点。 */
function warnBack(c: CanvasRenderingContext2D, x: number, r: number, t: number, max: number, time: number): void {
  if (t < 0) return;
  const k = Math.min(1, t / max);
  const pulse = .75 + .25 * Math.sin(time * (10 + k * 14));
  softPillar(c, x, '#ffc27a', (.35 + k * .5) * pulse, 8, r * .7);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createRadialGradient(x, FLOOR, 0, x, FLOOR, r);
  gr.addColorStop(0, `rgba(255,110,80,${.32 * k * pulse})`);
  gr.addColorStop(.75, `rgba(255,150,90,${.22 * k})`);
  gr.addColorStop(1, 'rgba(255,150,90,0)');
  c.fillStyle = gr;
  c.beginPath(); c.ellipse(x, FLOOR, r, r * .24, 0, 0, TAU); c.fill();
  c.restore();
}

/** 精英砸地预警：砸的方向那一侧的地面泛红，越接近出手越亮、越满。 */
function eliteWarn(c: CanvasRenderingContext2D, f: Fighter): void {
  const e = f.mob!.elite!;
  const k = 1 - e.windup / e.max;
  const move = e.move ?? 'slam';
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (move === 'dash') {
    // 冲刺：脚下往前一条红色冲刺道，越临近越亮、越往前伸。
    const len = 480 * ease(Math.min(1, k * 1.4));
    const x0 = f.x, x1 = f.x + e.dir * len;
    const gr = c.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, `rgba(255,110,80,${.45 + .3 * k})`);
    gr.addColorStop(1, 'rgba(255,110,80,0)');
    c.fillStyle = gr;
    c.fillRect(Math.min(x0, x1), FLOOR - 18, Math.abs(x1 - x0), 26);
    c.restore();
    return;
  }
  if (move === 'grab') {
    // 抓投：身前一团黄光，越来越亮（贴身的时候就该跳开或先手打断）。
    const cx = f.x + e.dir * 60;
    const gr = c.createRadialGradient(cx, FLOOR - 70, 0, cx, FLOOR - 70, 90);
    gr.addColorStop(0, `rgba(255,220,90,${.25 + .45 * k})`);
    gr.addColorStop(1, 'rgba(255,220,90,0)');
    c.fillStyle = gr;
    c.fillRect(cx - 90, FLOOR - 160, 180, 180);
    c.restore();
    return;
  }
  const cx = f.x + e.dir * e.reach * .5, rx = e.reach * .62;
  c.translate(cx, FLOOR + 2);
  c.scale(1, .24);
  // 整片危险区一层淡红，外缘一圈柔光边；里面一团更亮的红随出手临近从中心长满。
  const base = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  base.addColorStop(0, `rgba(255,60,70,${.16 + .14 * k})`);
  base.addColorStop(.82, `rgba(255,70,70,${.2 + .2 * k})`);
  base.addColorStop(1, 'rgba(255,70,70,0)');
  c.fillStyle = base;
  c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill();
  const r = Math.max(2, rx * ease(k));
  const core = c.createRadialGradient(0, 0, 0, 0, 0, r);
  core.addColorStop(0, `rgba(255,120,90,${.35 + .3 * k})`);
  core.addColorStop(1, 'rgba(255,90,80,0)');
  c.fillStyle = core;
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.restore();
}

function chestBack(c: CanvasRenderingContext2D, ch: Chest, t: number): void {
  if (ch.state === 0) {
    // 没开：箱子脚下一圈金色柔光，一束很淡的光柱提示「来开我」。
    softPillar(c, ch.x, '#FDE979', .35 + .12 * Math.sin(t * 4), 10, 48);
  } else {
    // 开箱：金色月光柱升起，开完慢慢散。
    const up = Math.min(1, ch.t / .35);
    const fade = ch.state === 2 ? Math.max(0, 1 - (ch.t - 1.6) / 1.1) : 1;
    softPillar(c, ch.x, '#ffe7a0', 1.5 * up * fade, 30 + 20 * up, 120, 'back', t, 10);
  }
  drawChestObject(c, ch, t);
}

/* ---------------- 人物之上 ---------------- */

export function drawJuiceFront(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  const t = g.age;
  const lead = g.fighters[0];
  if (m.spotT > 0 && lead) softPillar(c, lead.x, '#fff1c2', Math.min(1, m.spotT / .3), 34, 110, 'front');
  if (m.solo) soloFront(c, m.solo, lead, t);
  for (const s of m.supplies) {
    const blink = s.life < 3 ? (Math.sin(t * 18) > 0 ? 1 : .35) : 1;
    drawSupplyObject(c, s.kind, s.x, s.y + Math.sin(t * 3 + s.x) * 3, blink, t, 1, true);
  }
  for (const f of g.fighters) if (f.mob?.elite && f.hp > 0) eliteBar(c, f);
  for (const ch of m.chests) if (ch.state > 0) roulette(c, m, ch, t);
  for (const p of m.pulses) {
    if (p.k === 'impact') impact(c, p.x, p.y, p.t / p.max, p.color, p.n ?? 0, p.seed ?? 1, !!p.big, !!p.perfect);
    else pulse(c, p.k, p.x, p.y, p.t / p.max, p.color, p.dir ?? 1, p.n ?? 0);
  }
  lasersFx(c, m.lasers, t);
  orbsFx(c, m.orbs, t);
  ballsFx(c, m.balls, t);
  padChainsFx(c, m, m.padChains, t);
  moveFx(c, g, m, t);
  defenseFx(c, g, m, t);
  rareFx(c, g, m, t);
  if (m.grabbed && lead) mashPrompt(c, m, lead.x, lead.y - 230, t);
  if (lead && lead.hp > 0) dashPips(c, m, lead.x);
  if (m.dmgNums.length) drawDmgNums(c, m);
  foreCrowd(c, m, t);
}

function drawDmgNums(c: CanvasRenderingContext2D, m: MusouDirector): void {
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  for (const dn of m.dmgNums) {
    const k = dn.t / dn.max;
    const a = k < .7 ? 1 : Math.max(0, 1 - (k - .7) / .3);
    const pop = k < .15 ? 1.24 - .24 * (k / .15) : 1;
    const size = dn.kind === 'crit' ? 22 : dn.kind === 'break' ? 19 : 18;
    const col = dn.kind === 'crit' ? '#FDE979' : dn.kind === 'break' ? '#7fe7ff' : '#ffffff';
    c.save();
    c.globalAlpha = a;
    c.translate(dn.x, dn.y);
    c.scale(pop, pop);
    c.font = `900 ${size}px ${UI_FONT}`;
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(8,8,16,.88)';
    const label = dn.kind === 'crit' ? `${dn.v}!` : String(dn.v);
    c.strokeText(label, 0, 0);
    c.fillStyle = col;
    c.fillText(label, 0, 0);
    c.restore();
  }
  c.restore();
}

/** 被抓住时头顶的连按提示：一圈小格子，每按一下亮一格，外圈一道正在缩短的时间条。 */
function mashPrompt(c: CanvasRenderingContext2D, m: MusouDirector, x: number, y: number, t: number): void {
  const gr = m.grabbed!;
  const need = 6;
  const left = Math.max(0, 1 - gr.t / 1.6);
  c.save();
  c.fillStyle = 'rgba(10,10,22,.78)';
  c.beginPath(); c.roundRect(x - 62, y - 18, 124, 36, 18); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - 50, y + 14); c.lineTo(x - 50 + 100 * left, y + 14); c.stroke();
  for (let i = 0; i < need; i++) {
    const on = i < gr.mash;
    const px = x - 40 + i * 16, py = y - 2 + (on ? 0 : Math.sin(t * 20 + i) * 1.5);
    c.fillStyle = on ? '#FDE979' : 'rgba(255,255,255,.28)';
    c.beginPath(); c.roundRect(px - 5, py - 6, 10, 12, 3); c.fill();
  }
  c.font = `800 13px ${UI_FONT}`;
  c.textAlign = 'center';
  c.fillStyle = '#ffffff';
  c.fillText('连按挣脱', x, y - 26);
  c.restore();
}

/** 前景人群：画面最下沿一簇簇深色的头和肩，比长街走得快（视差），画面才有纵深；FEVER 或高黑胶评分时举起荧光棒。 */
function foreCrowd(c: CanvasRenderingContext2D, m: MusouDirector, t: number): void {
  const span = 560, n = 4;
  const k = Math.max(ease(m.feverK), m.grooveRank >= 3 ? (m.grooveRank - 2) * .22 : 0);
  const mood = TAGS[m.song.tag].mood;
  const off = -((m.scrollX * 1.35) % span);
  const beat = t * m.bpm / 60;
  c.save();
  for (let cl = -1; cl < 3; cl++) {
    const cx = off + cl * span + 120;
    for (let i = 0; i < n; i++) {
      const x = cx + i * 34 + (i % 2) * 6;
      const hop = k * Math.max(0, Math.sin(beat * Math.PI + i + cl)) * 6;
      const y = H + 26 - (i % 2) * 10 - hop;
      const s = 1.5 + (i % 3) * .12;
      if (k > .02) {
        // 举起来的荧光棒：棒身一条线、棒尖一点柔光。
        const ang = Math.sin(beat * Math.PI + i * .8 + cl) * .6;
        const hx = x + (i % 2 ? 16 : -16) * s, hy = y - 22 * s;
        const tx = hx + Math.sin(ang) * 40, ty = hy - Math.cos(ang) * 40;
        const col = i % 2 ? mood.f1 : mood.f2;
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = hexA(col, .8 * k); c.lineWidth = 4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(hx, hy); c.lineTo(tx, ty); c.stroke();
        c.globalAlpha = .6 * k;
        c.drawImage(glowDot(col), tx - 22, ty - 22, 44, 44);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
      c.fillStyle = 'rgba(8,6,16,.94)';
      c.beginPath();
      c.arc(x, y - 30 * s, 13 * s, 0, TAU);
      c.moveTo(x - 26 * s, y + 20);
      c.quadraticCurveTo(x - 24 * s, y - 14 * s, x, y - 14 * s);
      c.quadraticCurveTo(x + 24 * s, y - 14 * s, x + 26 * s, y + 20);
      c.fill();
      // 头顶一道舞台光勾的边。
      c.strokeStyle = hexA(mood.c1, .35 + .3 * k); c.lineWidth = 2;
      c.beginPath(); c.arc(x, y - 30 * s, 13 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    }
  }
  c.restore();
}

let vinylAng = 0, vinylLast = 0;
const GROOVE_COLS = ['#7e88a8', '#7fe7ff', '#FDE979', '#ff9b42', '#ff5ea8', '#fff4c2'] as const;
const GROOVE_CHARS = ['C', 'B', 'A', 'S', 'SS', 'MAX'] as const;
const GROOVE_NAMES = ['COLD', 'WARM', 'GROOVE', 'HOT', 'BLAZING', 'ENCORE!'] as const;
const GROOVE_THRESH = [0, 15, 35, 55, 75, 92] as const;
const TRACK_COLS: Record<GrooveMove, string> = {
  jab: '#7fe7ff', heavy: '#FDE979', skill: '#ff5ea8', dash: '#5cf2d6', slam: '#ff8a4c', toy: '#c8f181',
};

/** 动态黑胶评分仪：真实角速度旋转、换招音轨环、唱针火花、卡碟抖动与 BPM 脉动。 */
function drawVinylScore(c: CanvasRenderingContext2D, m: MusouDirector, w: number, t: number): void {
  const reduced = reducedMotion();
  const dt = vinylLast ? Math.min(.05, Math.max(0, t - vinylLast)) : 1 / 60;
  vinylLast = t;
  const rnk = Math.max(0, Math.min(5, m.grooveRank));
  const speed = reduced ? .5 : (.7 + rnk * .95) * (m.grooveRepeat >= 3 ? .55 : 1);
  vinylAng = (vinylAng + dt * speed) % TAU;

  const cx = w - 74, cy = 162, R = 39;
  const col = GROOVE_COLS[rnk];
  const scratch = (m.grooveScratch > 0 || m.grooveRepeat >= 3) && !reduced;
  const jx = scratch ? Math.sin(t * 72) * (m.grooveScratch > 0 ? 2.4 : 1.1) : 0;
  const jy = scratch ? Math.cos(t * 61) * (m.grooveScratch > 0 ? 1.8 : .8) : 0;
  const beatPulse = rnk >= 3 && !reduced ? (1 - m.beatFrac()) ** 2 : 0;
  const sc = 1 + (reduced ? 0 : .22 * m.groovePop + .055 * beatPulse);
  const alpha = m.groove <= 0.5 ? .42 : Math.min(1, .65 + m.groove / 30);

  c.save();
  c.globalAlpha = alpha;
  c.translate(cx + jx, cy + jy);

  // 最高档位 ENCORE 外围旋转霓虹光晕。
  if (rnk >= 4) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const glow = c.createRadialGradient(0, 0, R * .6, 0, 0, R * 1.65);
    glow.addColorStop(0, hexA(col, rnk === 5 ? .42 : .24));
    glow.addColorStop(1, hexA(col, 0));
    c.fillStyle = glow;
    c.beginPath(); c.arc(0, 0, R * 1.65, 0, TAU); c.fill();
    if (rnk === 5 && !reduced) {
      for (let i = 0; i < 3; i++) {
        const a = t * 1.8 + i * TAU / 3;
        const sx = Math.cos(a) * (R + 12), sy = Math.sin(a) * (R + 12);
        c.fillStyle = hexA('#fff4c2', .55 + .35 * Math.sin(t * 10 + i));
        star4(c, sx, sy, 4.5);
      }
    }
    c.restore();
  }

  // 黑胶本体与旋转盘面。
  c.save();
  c.scale(sc, sc);
  c.rotate(vinylAng);

  // 黑色乙烯基唱片底盘。
  const disc = c.createRadialGradient(0, 0, 8, 0, 0, R);
  disc.addColorStop(0, '#222038');
  disc.addColorStop(.5, '#12101f');
  disc.addColorStop(1, '#090812');
  c.fillStyle = disc;
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();

  // 同心细沟槽与斜向反光扇区。
  c.strokeStyle = 'rgba(255,255,255,.08)';
  c.lineWidth = 1;
  for (let rr = 20; rr <= R - 4; rr += 4) {
    c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.stroke();
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgba(255,255,255,.07)';
  c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R - 2, -.35, .25); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R - 2, Math.PI - .35, Math.PI + .25); c.closePath(); c.fill();

  // 换招彩色音轨弧段：每种招式在盘面刻下一段发光轨道。
  for (let i = 0; i < m.grooveTracks.length; i++) {
    const tr = m.grooveTracks[i];
    const fade = Math.max(0, 1 - tr.t / 4);
    const rr = 19 + (i % 5) * 3.8;
    const a0 = i * 1.45;
    const span = tr.fresh ? 2.4 : 1.5;
    c.strokeStyle = hexA(TRACK_COLS[tr.kind], (.35 + .55 * fade) * (m.grooveRepeat >= 3 ? .4 : 1));
    c.lineWidth = tr.fresh ? 2.5 : 1.8;
    c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, rr, a0, a0 + span); c.stroke();
  }
  if (scratch) {
    c.strokeStyle = 'rgba(220,225,240,.55)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-R * .75, -R * .2); c.lineTo(R * .65, R * .35); c.stroke();
    c.beginPath(); c.moveTo(-R * .3, R * .65); c.lineTo(R * .7, -R * .4); c.stroke();
  }
  c.restore();

  // 中心黑胶贴纸 + 轴孔。
  c.fillStyle = m.grooveRepeat >= 3 ? '#3b3e52' : col;
  c.beginPath(); c.arc(0, 0, 15.5, 0, TAU); c.fill();
  c.fillStyle = 'rgba(10,8,20,.82)';
  c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
  c.restore();

  // 外缘档位进度弧（不随盘面旋转，清晰读出距离升档还有多少）。
  const lo = GROOVE_THRESH[rnk];
  const hi = rnk < 5 ? GROOVE_THRESH[rnk + 1] : 100;
  const frac = rnk >= 5 ? 1 : Math.max(0, Math.min(1, (m.groove - lo) / Math.max(1, hi - lo)));
  c.save();
  c.scale(sc, sc);
  c.strokeStyle = 'rgba(255,255,255,.16)';
  c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, R + 2, 0, TAU); c.stroke();
  c.strokeStyle = hexA(m.grooveRepeat >= 3 ? '#9aa2b8' : col, .95);
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.beginPath(); c.arc(0, 0, R + 2, -Math.PI / 2, -Math.PI / 2 + TAU * frac); c.stroke();

  // 居中评级字母（不跟唱片一起转，始终易读）。
  const label = GROOVE_CHARS[rnk];
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `italic 900 ${label.length > 2 ? 11 : label.length > 1 ? 14 : 17}px ${UI_FONT}`;
  c.lineWidth = 3.5;
  c.strokeStyle = 'rgba(6,5,16,.9)';
  c.strokeText(label, 0, 1);
  c.fillStyle = m.grooveRepeat >= 3 ? '#b5bccf' : col;
  c.fillText(label, 0, 1);
  c.restore();

  // 右上动态金属唱臂与切音轨火花。
  const px = R + 9, py = -R + 4;
  const swing = .34 + .28 * m.grooveK - .12 * m.grooveNeedle + (scratch ? Math.sin(t * 50) * .06 : 0);
  const armLen = 30;
  const tipX = px - Math.sin(swing) * armLen, tipY = py + Math.cos(swing) * armLen;
  c.strokeStyle = '#cfd6eb';
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(px, py); c.lineTo(tipX, tipY); c.stroke();
  c.fillStyle = '#e8ecf8';
  c.beginPath(); c.arc(px, py, 4.5, 0, TAU); c.fill();
  c.fillStyle = '#18142c';
  c.beginPath(); c.arc(px, py, 2, 0, TAU); c.fill();
  if (m.grooveNeedle > .05) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = hexA('#ffffff', m.grooveNeedle);
    star4(c, tipX, tipY, 7 * m.grooveNeedle);
    c.restore();
  } else {
    c.fillStyle = col;
    c.beginPath(); c.arc(tipX, tipY, 2.5, 0, TAU); c.fill();
  }

  // 下方短状态字（冷场复读时闪出 REPEAT 提示）。
  const repWarn = m.grooveRepeat >= 3 && Math.sin(t * 14) > 0;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.font = `900 10px ${UI_FONT}`;
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(6,5,16,.85)';
  const sub = repWarn ? 'REPEAT' : GROOVE_NAMES[rnk];
  c.strokeText(sub, 0, R + 7);
  c.fillStyle = repWarn ? '#9ca3b8' : col;
  c.fillText(sub, 0, R + 7);

  c.restore();
}

/* ---------------- 屏幕空间：黑边名牌、击破里程碑 ---------------- */

export function drawMusouUi(c: CanvasRenderingContext2D, m: MusouDirector, cam: CamView, w: number, h: number, g?: FightGame): void {
  if (g) drawEdgeArrows(c, g, m, cam, w, h);
  if (g) drawDropsUi(c, g, m, cam, w, h);
  drawVinylScore(c, m, w, g ? g.age : performance.now() / 1000);
  // 事件镜头的上下黑边 + 名牌（精英登场）。
  if (cam.lb > .01) {
    const bar = h * .075 * cam.lb;
    c.save();
    c.fillStyle = 'rgba(4,3,10,.92)';
    c.fillRect(0, 0, w, bar);
    c.fillRect(0, h - bar, w, bar);
    if (cam.name && cam.nameK > 0) {
      const a = cam.nameK;
      const x = w * .5, y = h - bar - 22;
      c.globalAlpha = a;
      c.textAlign = 'center';
      c.font = `italic 900 ${Math.round(34 + 6 * (1 - a))}px ${UI_FONT}`;
      c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.6)';
      c.strokeText(cam.name, x, y);
      c.fillStyle = '#FDE979';
      c.fillText(cam.name, x, y);
      c.font = `800 13px ${UI_FONT}`;
      c.fillStyle = '#ffffff';
      c.fillText(cam.sub, x, y + 22);
    }
    c.restore();
  }
  // 击破里程碑：屏幕上方一个斜着盖下来的章，「300 击破」。
  const since = m.elapsed - m.milestoneAt;
  if (since >= 0 && since < 1.3 && m.milestone > 0) {
    const inK = Math.min(1, since / .12), out = Math.max(0, 1 - Math.max(0, since - .9) / .4);
    const sc = 1.6 - .6 * ease(inK);
    c.save();
    // 放在人群上方、强化卡提示下面，不和顶部的卡片提示叠在一起。
    c.translate(w * .5, h * .42);
    c.rotate(-.08);
    c.scale(sc, sc);
    c.globalAlpha = inK * out;
    const label = `${m.milestone * 100}`;
    c.textAlign = 'right';
    c.font = 'italic 46px Impact, sans-serif';
    c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,.55)';
    c.strokeText(label, 6, 12);
    c.fillStyle = '#ffffff';
    c.fillText(label, 6, 12);
    c.textAlign = 'left';
    c.font = `900 18px ${UI_FONT}`;
    c.lineWidth = 4;
    c.strokeText('击破', 12, 8);
    c.fillStyle = '#FDE979';
    c.fillText('击破', 12, 8);
    c.restore();
  }
}

function eliteBar(c: CanvasRenderingContext2D, f: Fighter): void {
  const w = 96, h = 7;
  const x = f.x - w / 2, y = f.y - 200;
  const k = Math.max(0, f.hp / f.data.hp);
  c.save();
  c.fillStyle = 'rgba(8,8,16,.78)';
  c.beginPath(); c.roundRect(x - 2, y - 2, w + 4, h + 4, 4); c.fill();
  const gr = c.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, '#ff5a5a'); gr.addColorStop(1, '#FDE979');
  c.fillStyle = gr;
  c.beginPath(); c.roundRect(x, y, w * k, h, 3); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x - 2, y - 2, w + 4, h + 4, 4); c.stroke();
  // 「精英」小角标：一颗金色四角星。
  c.fillStyle = '#FDE979';
  star4(c, x - 10, y + h / 2, 6);
  c.restore();
}

/** 开箱轮盘：箱子上方一块圆角牌，中间是当前格，两边是前后两格（淡、小），转得越来越慢，停下时一圈金光。 */
function roulette(c: CanvasRenderingContext2D, m: MusouDirector, ch: Chest, t: number): void {
  const n = ch.reel.length;
  const face = m.chestFace(ch);
  const done = ch.state === 2;
  const fade = done ? Math.max(0, 1 - (ch.t - 2.1) / .5) : Math.min(1, ch.t / .25);
  if (fade <= 0) return;
  const x = ch.x, y = FLOOR - 175 - Math.min(1, ch.t / .3) * 10;
  c.save();
  c.globalAlpha = fade;
  // 底牌：深色半透明 + 金色细边。
  c.fillStyle = 'rgba(14,14,30,.82)';
  c.beginPath(); c.roundRect(x - 88, y - 34, 176, 68, 18); c.fill();
  c.strokeStyle = done ? 'rgba(253,233,121,.95)' : 'rgba(253,233,121,.45)'; c.lineWidth = 2;
  c.stroke();
  for (const d of [-1, 1]) {
    const k = ch.reel[(face + d + n) % n];
    c.save(); c.globalAlpha = fade * .35; prizeIcon(c, k, x + d * 56, y, .7, t); c.restore();
  }
  const pop = done ? 1 + .25 * Math.max(0, 1 - (ch.t - 1.6) / .25) : 1;
  prizeIcon(c, ch.reel[face], x, y, 1.1 * pop, t);
  c.restore();
  if (done && ch.t < 2.1) {
    const k = (ch.t - 1.6) / .5;
    ring(c, x, y, 30 + 70 * ease(k), '#FDE979', .6 * (1 - k));
  }
}

function prizeIcon(c: CanvasRenderingContext2D, k: ChestPrize, x: number, y: number, s: number, t: number): void {
  if (k === 'card') {
    c.save(); c.translate(x, y); c.scale(s, s); c.rotate(-.12);
    c.fillStyle = '#f6efe0'; c.beginPath(); c.roundRect(-14, -19, 28, 38, 4); c.fill();
    c.fillStyle = '#ff3b7f'; c.fillRect(-14, -19, 28, 9);
    c.fillStyle = '#E9C46A'; star4(c, 0, 5, 8);
    c.restore();
  } else drawSupplyObject(c, k, x, y + 10 * s, 1, t, s, false);
}

/** 一圈柔光环（径向渐变，中空）。 */
function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number, w = .3): void {
  if (a <= .005 || r <= 1) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const gr = c.createRadialGradient(x, y, r * (1 - w), x, y, r);
  gr.addColorStop(0, hexA(color, 0));
  gr.addColorStop(.7, hexA(color, a));
  gr.addColorStop(1, hexA(color, 0));
  c.fillStyle = gr;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.restore();
}

/** 冲锋格子：脚下两颗小点，有格是亮的，回复中的那颗按进度描一圈。 */
function dashPips(c: CanvasRenderingContext2D, m: MusouDirector, x: number): void {
  c.save();
  for (let i = 0; i < 2; i++) {
    const px = x - 9 + i * 18, py = FLOOR + 14;
    const on = i < m.dashCharges;
    c.fillStyle = on ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.15)';
    c.beginPath(); c.arc(px, py, 3.2, 0, TAU); c.fill();
    if (!on && i === m.dashCharges) {
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(px, py, 5, -Math.PI / 2, -Math.PI / 2 + TAU * (m.dashRegen / 2.4)); c.stroke();
    }
  }
  c.restore();
}

function pulse(c: CanvasRenderingContext2D, k: string, x: number, y: number, u: number, color: string, dir: number, n = 0): void {
  const e = ease(u);
  if (k === 'ult') {
    // 大招清场：角色色的一道柔光环从她身上推到屏幕外，前段整个画面被照亮一下。
    const r = 60 + 1050 * u ** .75;
    ring(c, x, y, r, color, .75 * (1 - u), .24);
    ring(c, x, y, r * .7, '#ffffff', .5 * (1 - u), .16);
    softPillar(c, x, color, 1.4 * (1 - u), 40 + 60 * e, 140 + 120 * e, 'back');
    if (u < .35) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const fl = c.createRadialGradient(x, y, 0, x, y, 900);
      fl.addColorStop(0, hexA('#ffffff', .5 * (1 - u / .35)));
      fl.addColorStop(1, hexA(color, 0));
      c.fillStyle = fl; c.fillRect(-260, -260, W + 520, H + 520);
      c.restore();
    }
  } else if (k === 'boom') {
    ring(c, x, y, 30 + 1000 * e, color, .65 * (1 - u), .25);
    if (u < .25) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = hexA(color, .22 * (1 - u / .25)); c.fillRect(-260, -260, W + 520, H + 520); c.restore(); }
  } else if (k === 'mega') {
    // 扩音器：一圈金光从屏幕边缘收回到主角身上（星屑被吸过来）。
    ring(c, x, y, 40 + 900 * (1 - e), color, .55 * Math.sin(u * Math.PI), .2);
  } else if (k === 'fever') {
    ring(c, x, y, 40 + 800 * e, color, .55 * (1 - u), .3);
  } else if (k === 'perfect') {
    // 完美：脚下一圈金光扩开（踩在地上，压扁）。
    c.save();
    c.translate(x, y);
    c.scale(1, .24);
    ring(c, 0, 0, 44 + 120 * e, color, .9 * (1 - u), .45);
    c.restore();
    ring(c, x, y - 70, 20 + 60 * e, '#ffffff', .35 * (1 - u), .4);
  } else if (k === 'shield') {
    if (n === 0) {
      // 二段跳：脚下一圈压扁的小光环。
      c.save(); c.translate(x, y); c.scale(1, .3); ring(c, 0, 0, 20 + 60 * e, color, .8 * (1 - u), .4); c.restore();
    } else if (n === 1) {
      // 次数盾碎了：一圈青色碎光。
      ring(c, x, y, 10 + 50 * e, color, .8 * (1 - u), .35);
    } else {
      // 应援团长加盾：一圈青色的光从团长身上往外扩。
      ring(c, x, y, 40 + 240 * e, color, .5 * (1 - u), .2);
    }
  } else if (k === 'break') {
    ring(c, x, y, 30 + 380 * e, color, .75 * (1 - u), .3);
  } else if (k === 'open') {
    ring(c, x, y, 20 + 240 * e, color, .7 * (1 - u), .35);
  } else if (k === 'slam') {
    c.save();
    c.translate(x, y);
    c.scale(1, .24);
    ring(c, 0, 0, 40 + 120 * e, color, .8 * (1 - u), .4);
    c.restore();
    void dir;
  } else if (k === 'feedback') {
    ring(c, x, y, 40 + 700 * e, color, .55 * (1 - u), .22);
  } else if (k === 'zap') {
    ring(c, x, y, 25 + 280 * e, color, .85 * (1 - u), .3);
  }
}

function star4(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

/* ---------------- 屏幕空间（不跟震屏、镜头） ---------------- */

/** 受伤：屏幕四边一圈红色柔光，越伤越浓；低血时随拍子呼吸微闪；一线生机触发时强脉冲提示。 */
export function drawHurtEdge(c: CanvasRenderingContext2D, m: MusouDirector, lead: Fighter | undefined, w: number, h: number): void {
  const ratio = lead && lead.hp > 0 ? lead.hp / lead.data.hp : 1;
  const low = lead && lead.hp > 0 ? Math.max(0, .25 - ratio) / .25 : 0;
  const beat = .72 + .28 * Math.cos(m.beatFrac() * TAU);
  const gate = m.gateFlash > 0 ? (m.gateFlash / .55) * .68 : 0;
  const a = Math.max(m.hurtK * .55, low * .34 * beat, gate);
  if (a <= .01) return;
  c.save();
  const gr = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .36, w / 2, h / 2, Math.hypot(w, h) * .56);
  gr.addColorStop(0, 'rgba(255,30,60,0)');
  gr.addColorStop(1, `rgba(255,30,60,${a})`);
  c.fillStyle = gr;
  c.fillRect(0, 0, w, h);
  c.restore();
}

/* ======================== P3 画面 ======================== */

/** 可复现的随机数（同一次下砸的光刺形状在整段动画里不变）。 */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---- 下砸特效（路线 B：8 帧灰度冲击波序列帧 + 256 级角色色阶 LUT + 代码尖刺/光柱/星芒/暗裂纹 + 两级光学 Bloom）---- */

const SLAM_CELL_W = 256, SLAM_CELL_H = 320, SLAM_AX = 128, SLAM_AY = 264;
const SLAM_BOUNDS = [0, .053, .118, .206, .306, .429, .582, .771, 1] as const;
const VFX_W = 560, VFX_H = 620, VFX_OX = 280, VFX_OY = 520;

interface SlamPal {
  dark: readonly [number, number, number];
  mid: readonly [number, number, number];
  bright: readonly [number, number, number];
  hot: readonly [number, number, number];
  midHex: string;
  brightHex: string;
  hotHex: string;
}

const slamPalCache = new Map<string, SlamPal>();
const slamBakedCache = new Map<string, HTMLCanvasElement>();
let slamImg: HTMLImageElement | null = null;
let slamSrcPixels: Uint8ClampedArray | null = null;
let slamW = 1024, slamH = 640;

let vfxBuf: HTMLCanvasElement | null = null, vfxCtx: CanvasRenderingContext2D | null = null;
let bloom1: HTMLCanvasElement | null = null, b1Ctx: CanvasRenderingContext2D | null = null;
let bloom2: HTMLCanvasElement | null = null, b2Ctx: CanvasRenderingContext2D | null = null;

function ensureSlamSheet(): void {
  if (slamImg || typeof Image === 'undefined') return;
  const im = new Image();
  im.src = assetUrl('/musou/slam-shockwave.webp');
  slamImg = im;
}

function ensureSlamBuffers(): boolean {
  if (typeof document === 'undefined') return false;
  if (!vfxBuf) {
    vfxBuf = document.createElement('canvas');
    vfxBuf.width = VFX_W; vfxBuf.height = VFX_H;
    vfxCtx = vfxBuf.getContext('2d');
    bloom1 = document.createElement('canvas');
    bloom1.width = 140; bloom1.height = 155;
    b1Ctx = bloom1.getContext('2d');
    bloom2 = document.createElement('canvas');
    bloom2.width = 70; bloom2.height = 78;
    b2Ctx = bloom2.getContext('2d');
  }
  return !!(vfxCtx && b1Ctx && b2Ctx);
}

function hslToRgb255(hh: number, ss: number, ll: number): readonly [number, number, number] {
  const h = ((hh % 360) + 360) % 360;
  const C = (1 - Math.abs(2 * ll - 1)) * ss;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = ll - C / 2;
  const [a, b2, c2] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  const to = (v: number) => Math.round(Math.max(0, Math.min(255, (v + m0) * 255)));
  return [to(a), to(b2), to(c2)];
}

const toHex = (c: readonly [number, number, number]) => `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`;
const lerpRgb = (a: readonly [number, number, number], b: readonly [number, number, number], u: number): readonly [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * u),
  Math.round(a[1] + (b[1] - a[1]) * u),
  Math.round(a[2] + (b[2] - a[2]) * u),
];

function slamPalette(hex: string): SlamPal {
  let p = slamPalCache.get(hex);
  if (p) return p;
  const [r, g, b] = rgb(hex).map(v => v / 255) as [number, number, number];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const dark = hslToRgb255(h + 16, .65, .18);
  const mid = hslToRgb255(h, Math.max(.75, s), .48);
  const bright = hslToRgb255(h + 30, .92, .68);
  const hot = hslToRgb255(h - 14, .95, .88);
  p = { dark, mid, bright, hot, midHex: toHex(mid), brightHex: toHex(bright), hotHex: toHex(hot) };
  slamPalCache.set(hex, p);
  return p;
}

/** 用 256 级四段色阶映射一次性把黑白冲击波序列帧烘成角色色（含 4px 边缘软羽化）。 */
function bakeSlamSheet(hex: string): HTMLCanvasElement | null {
  const cached = slamBakedCache.get(hex);
  if (cached) return cached;
  ensureSlamSheet();
  if (!slamImg || !slamImg.complete || !slamImg.naturalWidth || typeof document === 'undefined') return null;
  if (!slamSrcPixels) {
    slamW = slamImg.naturalWidth;
    slamH = slamImg.naturalHeight;
    const scv = document.createElement('canvas');
    scv.width = slamW; scv.height = slamH;
    const sg = scv.getContext('2d');
    if (!sg) return null;
    sg.drawImage(slamImg, 0, 0);
    slamSrcPixels = sg.getImageData(0, 0, slamW, slamH).data;
  }
  const pal = slamPalette(hex);
  const lut = new Uint8ClampedArray(256 * 4);
  const white: readonly [number, number, number] = [255, 255, 255];
  for (let L = 0; L < 256; L++) {
    const idx = L * 4;
    if (L < 10) continue;
    const t = (L - 10) / 245;
    const col = t < .25 ? lerpRgb(pal.dark, pal.mid, t / .25)
      : t < .7 ? lerpRgb(pal.mid, pal.bright, (t - .25) / .45)
        : t < .9 ? lerpRgb(pal.bright, pal.hot, (t - .7) / .2)
          : lerpRgb(pal.hot, white, (t - .9) / .1);
    lut[idx] = col[0]; lut[idx + 1] = col[1]; lut[idx + 2] = col[2];
    lut[idx + 3] = Math.min(255, Math.round((t ** .72) * 255));
  }
  const outCv = document.createElement('canvas');
  outCv.width = slamW; outCv.height = slamH;
  const og = outCv.getContext('2d');
  if (!og) return null;
  const outImg = og.createImageData(slamW, slamH);
  const dst = outImg.data;
  const src = slamSrcPixels;
  for (let y = 0; y < slamH; y++) {
    const rowOff = y * slamW;
    for (let x = 0; x < slamW; x++) {
      const p = (rowOff + x) * 4;
      const lum = (src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29) >> 8;
      const li = lum * 4;
      let a = lut[li + 3];
      if (a > 0) {
        const cx = x % SLAM_CELL_W;
        if (cx < 4) a = (a * cx) >> 2;
        else if (cx > SLAM_CELL_W - 5) a = (a * (SLAM_CELL_W - 1 - cx)) >> 2;
      }
      dst[p] = lut[li]; dst[p + 1] = lut[li + 1]; dst[p + 2] = lut[li + 2]; dst[p + 3] = a;
    }
  }
  og.putImageData(outImg, 0, 0);
  if (slamBakedCache.size >= 12) {
    const oldest = slamBakedCache.keys().next().value;
    if (oldest) slamBakedCache.delete(oldest);
  }
  slamBakedCache.set(hex, outCv);
  return outCv;
}

function drawSlamCell(c: CanvasRenderingContext2D, sheet: HTMLCanvasElement, idx: number, cx: number, cy: number, scale: number, alpha: number): void {
  if (alpha <= .005) return;
  const col = idx % 4, row = (idx / 4) | 0;
  const dw = SLAM_CELL_W * scale, dh = SLAM_CELL_H * scale;
  c.save();
  c.globalAlpha *= alpha;
  c.drawImage(sheet, col * SLAM_CELL_W, row * SLAM_CELL_H, SLAM_CELL_W, SLAM_CELL_H, cx - SLAM_AX * scale, cy - SLAM_AY * scale, dw, dh);
  c.restore();
}

function drawUnifiedPillar(c: CanvasRenderingContext2D, cx: number, cy: number, T: number, pal: SlamPal): void {
  if (T >= .36) return;
  const k = Math.min(1, T / .36);
  const fade = T < .05 ? .75 + .25 * (T / .05) : Math.max(0, 1 - (T - .05) / .31);
  const shrink = 1 - k * .58;
  // 1. 一整根洁净的 Moonlight 式外层柔光柱。
  const topW = 16 * shrink, botW = 50 * shrink;
  const colGr = c.createLinearGradient(cx - botW, 0, cx + botW, 0);
  colGr.addColorStop(0, hexA(pal.brightHex, 0));
  colGr.addColorStop(.5, hexA(pal.brightHex, .28 * fade));
  colGr.addColorStop(1, hexA(pal.brightHex, 0));
  c.fillStyle = colGr;
  c.beginPath();
  c.moveTo(cx - topW, 0); c.lineTo(cx + topW, 0);
  c.lineTo(cx + botW, cy + 2); c.lineTo(cx - botW, cy + 2);
  c.closePath(); c.fill();
  // 2. 极凝实的高亮白芯。
  if (T < .16) {
    const cf = Math.max(0, 1 - T / .16);
    const cw = 10 * (1 - T / .18);
    const cg = c.createLinearGradient(cx - cw, 0, cx + cw, 0);
    cg.addColorStop(0, hexA(pal.hotHex, 0));
    cg.addColorStop(.35, hexA(pal.hotHex, .88 * cf));
    cg.addColorStop(.5, `rgba(255,255,255,${.96 * cf})`);
    cg.addColorStop(.65, hexA(pal.hotHex, .88 * cf));
    cg.addColorStop(1, hexA(pal.hotHex, 0));
    c.fillStyle = cg;
    c.beginPath();
    c.moveTo(cx - cw * .45, 0); c.lineTo(cx + cw * .45, 0);
    c.lineTo(cx + cw, cy + 2); c.lineTo(cx - cw, cy + 2);
    c.closePath(); c.fill();
  }
  // 3. 0.08s 后抽出 4 根干净的竖向光矛。
  if (T > .08) {
    const sk = Math.min(1, (T - .08) / .28);
    const sf = 1 - sk;
    const spears = [
      { dx: -22, w: 3.0, h: 175, spd: 110 },
      { dx: -7, w: 4.5, h: 230, spd: 150 },
      { dx: 8, w: 4.2, h: 215, spd: 138 },
      { dx: 23, w: 2.8, h: 165, spd: 98 },
    ];
    for (const sp of spears) {
      const yb = cy - 12 - sk * sp.spd;
      const gr = c.createLinearGradient(0, yb - sp.h, 0, yb);
      gr.addColorStop(0, hexA(pal.hotHex, 0));
      gr.addColorStop(.55, hexA(pal.hotHex, .75 * sf));
      gr.addColorStop(1, hexA('#ffffff', .88 * sf));
      c.fillStyle = gr;
      c.beginPath();
      c.moveTo(cx + sp.dx - sp.w, yb); c.lineTo(cx + sp.dx, yb - sp.h); c.lineTo(cx + sp.dx + sp.w, yb);
      c.closePath(); c.fill();
    }
  }
}

/** 锐利的二次元爆发尖刺（画在 vfxBuf 里，随序列帧一起走统一 Bloom）。 */
function drawBurstSpikes(c: CanvasRenderingContext2D, cx: number, cy: number, T: number, pal: SlamPal, n: number, seed: number, big: boolean): void {
  if (T >= .22) return;
  const R = rng(seed + 19);
  const grow = ease(Math.min(1, T / .055));
  const fade = T < .07 ? 1 : Math.max(0, 1 - (T - .07) / .15);
  const count = big ? 8 + Math.min(3, n) : 5;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? .5 : i / (count - 1);
    const ang = -2.92 + u * 2.7 + (R() - .5) * .16;
    const hero = i % 2 === 1;
    const len = (hero ? 130 + R() * 95 : 80 + R() * 65) * (big ? 1 : .74) * (.55 + .45 * grow);
    const w = (hero ? 7.5 + R() * 3.5 : 5 + R() * 2.5) * (1 - Math.max(0, T - .06) / .18 * .65);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const nx = -sa, ny = ca;
    const sx = cx, sy = cy - 4;
    const mx = sx + ca * len * .14, my = sy + sa * len * .14;
    const ex = sx + ca * len, ey = sy + sa * len;
    // 主刺体（高对比角色亮色，锐利收尖）。
    c.fillStyle = hexA(hero ? pal.brightHex : pal.midHex, (.78 + R() * .16) * fade);
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(mx + nx * w, my + ny * w);
    c.lineTo(ex, ey);
    c.lineTo(mx - nx * w, my - ny * w);
    c.closePath();
    c.fill();
    // 亮白内脊。
    const iw = w * .42;
    c.fillStyle = hexA(hero ? '#ffffff' : pal.hotHex, .88 * fade);
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(mx + nx * iw, my + ny * iw);
    c.lineTo(sx + ca * len * .82, sy + sa * len * .82);
    c.lineTo(mx - nx * iw, my - ny * iw);
    c.closePath();
    c.fill();
  }
  c.restore();
}

function impact(c: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, n: number, seed: number, big: boolean, perfect: boolean): void {
  const pal = slamPalette(color);
  const lv = big ? 1 + n * .16 : .68;
  const T = u * (big ? 1.2 : .8);
  const dur = big ? .86 : .64;

  // 1. 合批渲染进本地 vfxBuf + 两级降采样 Bloom（彻底消灭半透明叠块接缝）。
  if (T < dur && ensureSlamBuffers() && vfxCtx && b1Ctx && b2Ctx && vfxBuf && bloom1 && bloom2) {
    vfxCtx.setTransform(1, 0, 0, 1, 0, 0);
    vfxCtx.clearRect(0, 0, VFX_W, VFX_H);
    vfxCtx.globalCompositeOperation = 'source-over';
    if (big) drawUnifiedPillar(vfxCtx, VFX_OX, VFX_OY, T, pal);
    drawBurstSpikes(vfxCtx, VFX_OX, VFX_OY, T, pal, n, seed, big);

    const sheet = bakeSlamSheet(color);
    if (sheet) {
      const p = T / dur;
      let idx = 7;
      for (let i = 0; i < 8; i++) if (p < SLAM_BOUNDS[i + 1]) { idx = i; break; }
      const fu = Math.max(0, Math.min(1, (p - SLAM_BOUNDS[idx]) / (SLAM_BOUNDS[idx + 1] - SLAM_BOUNDS[idx])));
      const sScale = big ? 1.55 : 1.15;
      vfxCtx.globalCompositeOperation = 'lighter';
      if (idx >= 4 && idx < 7 && fu > .75) {
        const bl = (fu - .75) / .25;
        drawSlamCell(vfxCtx, sheet, idx, VFX_OX, VFX_OY, sScale, 1 - bl);
        drawSlamCell(vfxCtx, sheet, idx + 1, VFX_OX, VFX_OY, sScale, bl);
      } else {
        drawSlamCell(vfxCtx, sheet, idx, VFX_OX, VFX_OY, sScale, idx === 7 ? 1 - fu : 1);
      }
    }

    const bs = Math.max(1, lv);
    const dx = x - VFX_OX * bs, dy = y - VFX_OY * bs, dw = VFX_W * bs, dh = VFX_H * bs;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.drawImage(vfxBuf, dx, dy, dw, dh);

    b1Ctx.clearRect(0, 0, bloom1.width, bloom1.height);
    b1Ctx.imageSmoothingEnabled = true;
    b1Ctx.imageSmoothingQuality = 'high';
    b1Ctx.drawImage(vfxBuf, 0, 0, bloom1.width, bloom1.height);
    c.globalAlpha = .34;
    c.drawImage(bloom1, dx, dy, dw, dh);

    if (!isLiteFx()) {
      b2Ctx.clearRect(0, 0, bloom2.width, bloom2.height);
      b2Ctx.imageSmoothingEnabled = true;
      b2Ctx.imageSmoothingQuality = 'high';
      b2Ctx.drawImage(bloom1, 0, 0, bloom2.width, bloom2.height);
      c.globalAlpha = .24;
      c.drawImage(bloom2, dx, dy, dw, dh);
    }
    c.restore();
  }

  // 2. 前景锐线星芒（光柱腰部，0～0.24 秒）与收尾上升光丝/星点（0.26 秒后）。
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (T < .24) {
    const RN = rng(seed + 505);
    const grow = ease(Math.min(1, T / .06));
    const fade = T < .09 ? 1 : Math.max(0, 1 - (T - .09) / .15);
    const cy = y - 62 * lv;
    const rays = big ? 16 + n * 2 : 9;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * TAU + (RN() - .5) * .22;
      const r0 = (10 + RN() * 12) * lv * grow;
      const len = (55 + RN() * 90) * lv * (.65 + .35 * grow);
      const sx = x + Math.cos(ang) * r0, sy = cy + Math.sin(ang) * r0 * .72;
      const ex = x + Math.cos(ang) * (r0 + len), ey = cy + Math.sin(ang) * (r0 + len) * .72;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const al = (.74 + RN() * .24) * fade;
      const w = 1 + RN() * 1.1;
      const drawRay = (ox: number, oy: number, col: string, a: number, hw: number) => {
        const mx = sx + (ex - sx) * .25 + ox, my = sy + (ey - sy) * .25 + oy;
        const gr = c.createLinearGradient(sx, sy, ex, ey);
        gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(.25, hexA(col, a)); gr.addColorStop(1, hexA(col, 0));
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(sx + ox, sy + oy); c.lineTo(mx + nx * hw, my + ny * hw);
        c.lineTo(ex + ox, ey + oy); c.lineTo(mx - nx * hw, my - ny * hw);
        c.closePath(); c.fill();
      };
      if (RN() < .4) {
        drawRay(-nx * 1.4, -ny * 1.4, '#ff8055', al * .5, w * .85);
        drawRay(nx * 1.4, ny * 1.4, '#5cd6ff', al * .5, w * .85);
      }
      drawRay(0, 0, '#ffffff', al, w);
    }
    if (perfect) {
      for (let i = 0; i < 4; i++) {
        const ang = -Math.PI * (.18 + i * .21);
        const sx = x + Math.cos(ang) * 14 * lv, sy = cy + Math.sin(ang) * 14 * lv;
        const ex = x + Math.cos(ang) * 145 * lv, ey = cy + Math.sin(ang) * 145 * lv;
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const mx = sx + (ex - sx) * .25, my = sy + (ey - sy) * .25;
        const gr = c.createLinearGradient(sx, sy, ex, ey);
        gr.addColorStop(0, 'rgba(255,244,200,0)'); gr.addColorStop(.25, `rgba(255,244,200,${.92 * fade})`); gr.addColorStop(1, 'rgba(255,244,200,0)');
        c.fillStyle = gr;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(mx + nx * 2.2, my + ny * 2.2); c.lineTo(ex, ey); c.lineTo(mx - nx * 2.2, my - ny * 2.2); c.closePath(); c.fill();
      }
    }
  }

  if (T > .26) {
    const k = Math.min(1, (T - .26) / (big ? .72 : .44));
    const fade = Math.sin(Math.min(1, k / .2) * Math.PI * .5) * Math.max(0, 1 - Math.max(0, k - .22) / .78);
    const RS = rng(seed + 707);
    c.lineCap = 'round';
    for (let i = 0; i < (big ? 7 : 3); i++) {
      const ox = (RS() - .5) * 160 * lv;
      const hLen = 45 + RS() * 75;
      const yb = y - 10 - k * (55 + RS() * 80);
      const gr = c.createLinearGradient(0, yb - hLen, 0, yb);
      gr.addColorStop(0, hexA(pal.hotHex, 0));
      gr.addColorStop(.5, hexA(i % 2 ? pal.hotHex : pal.brightHex, .62 * fade));
      gr.addColorStop(1, hexA(pal.midHex, 0));
      c.strokeStyle = gr; c.lineWidth = 1.2 + RS();
      c.beginPath(); c.moveTo(x + ox, yb - hLen); c.lineTo(x + ox, yb); c.stroke();
    }
    for (let i = 0; i < (big ? 12 : 5); i++) {
      const sx = x + (RS() - .5) * (150 + k * 90) * lv;
      const sy = y - 12 - RS() * 60 - k * (40 + RS() * 80);
      c.fillStyle = hexA('#ffffff', (.55 + RS() * .4) * fade);
      c.beginPath(); c.arc(sx, sy, 1.2 + RS() * 1.4, 0, TAU); c.fill();
    }
  }
  c.restore();
}

/** 落地后的锯齿暗坑、中心柔光池与分叉深黑裂纹（画在人物之下，source-over 压暗）。 */
function impactGround(c: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, seed: number, big: boolean, n: number): void {
  const pal = slamPalette(color);
  const lv = big ? 1 + n * .16 : .68;
  const T = u * (big ? 1.2 : .8);
  const inK = ease(Math.min(1, T / .07));
  const fade = T < .48 ? 1 : Math.max(0, 1 - (T - .48) / (big ? .68 : .32));
  if (fade <= 0) return;

  // 不规则锯齿状深暗地坑阴影（无椭圆描边）。
  c.save();
  c.translate(x, y + 2);
  c.scale(1, .24);
  const rx = 148 * lv * (.65 + .35 * inK);
  const gr = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(4,4,12,${.66 * fade})`);
  gr.addColorStop(.62, `rgba(6,8,16,${.44 * fade})`);
  gr.addColorStop(1, 'rgba(6,8,16,0)');
  c.fillStyle = gr;
  c.beginPath();
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * TAU;
    const jag = i % 2 === 0 ? 1.04 + Math.sin(i * 3.1 + seed) * .14 : .72 + Math.cos(i * 2.5 + seed) * .1;
    const px = Math.cos(ang) * rx * jag, py = Math.sin(ang) * rx * jag;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath(); c.fill();
  c.restore();

  // 坑底柔和角色色光池。
  c.save();
  c.globalCompositeOperation = 'lighter';
  const pr = 128 * lv;
  const pool = c.createRadialGradient(x, y + 1, 2, x, y + 1, pr);
  pool.addColorStop(0, hexA(pal.midHex, .32 * fade));
  pool.addColorStop(.55, hexA(pal.brightHex, .12 * fade));
  pool.addColorStop(1, hexA(pal.brightHex, 0));
  c.translate(x, y + 1);
  c.scale(1, .24);
  c.fillStyle = pool;
  c.beginPath(); c.arc(0, 0, pr, 0, TAU); c.fill();
  c.restore();

  // 分叉深黑裂纹。
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = `rgba(3,3,9,${.88 * fade})`;
  const RC = rng(seed + 101);
  for (let i = 0; i < (big ? 6 : 3); i++) {
    const side = i % 2 ? 1 : -1;
    const ang = (side > 0 ? 0 : Math.PI) + (RC() - .5) * .9;
    const totalL = (64 + RC() * 68) * lv * inK;
    let px = x + Math.cos(ang) * 5, py = y + 1 + Math.sin(ang) * 2;
    for (let s = 0; s < 4; s++) {
      const su = (s + 1) / 4;
      const nx = px + Math.cos(ang + (RC() - .5) * .42) * (totalL / 4);
      const ny = py + Math.sin(ang + (RC() - .5) * .42) * (totalL / 4) * .25;
      c.lineWidth = Math.max(.7, 3.2 * (1 - su * .7));
      c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
      if (s === 1 || (s === 2 && RC() < .55)) {
        const ba = ang + (RC() < .5 ? .5 : -.5);
        const bl = (16 + RC() * 20) * lv;
        c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(nx, ny); c.lineTo(nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl * .25); c.stroke();
      }
      px = nx; py = ny;
    }
  }
  c.restore();
}

/** 下落时：4 条弯曲且上下两端渐隐的柔光气流带 + 几缕细风丝与微光点。 */
function airSheath(c: CanvasRenderingContext2D, x: number, y: number, heavy: boolean, t: number, color: string, k: number): void {
  const H = (heavy ? 185 : 130) * k, Wt = (heavy ? 54 : 40) * k;
  const foot = y - 2;
  const pal = slamPalette(color);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const ribbons = [
    { sx: -24, ex: -42, w: 22, h: H, a: .085, col: pal.brightHex },
    { sx: 24, ex: 42, w: 22, h: H, a: .085, col: pal.brightHex },
    { sx: -14, ex: -26, w: 16, h: H * .92, a: .105, col: pal.midHex },
    { sx: 14, ex: 26, w: 16, h: H * .92, a: .105, col: pal.midHex },
  ];
  for (let i = 0; i < ribbons.length; i++) {
    const rb = ribbons[i];
    const wob = Math.sin(t * 24 + i * 1.7) * 2.2;
    const gr = c.createLinearGradient(0, foot + 8, 0, foot - rb.h);
    gr.addColorStop(0, hexA(rb.col, 0));
    gr.addColorStop(.28, hexA(rb.col, rb.a * k));
    gr.addColorStop(.68, hexA(rb.col, rb.a * .72 * k));
    gr.addColorStop(1, hexA(rb.col, 0));
    c.fillStyle = gr;
    c.beginPath();
    c.moveTo(x + rb.sx * .35 - rb.w * .25, foot + 6);
    c.quadraticCurveTo(x + rb.sx + wob, foot - rb.h * .45, x + rb.ex - rb.w * .5, foot - rb.h);
    c.lineTo(x + rb.ex + rb.w * .5, foot - rb.h);
    c.quadraticCurveTo(x + rb.sx + wob + rb.w * .65, foot - rb.h * .45, x + rb.sx * .35 + rb.w * .35, foot + 6);
    c.closePath();
    c.fill();
  }
  c.lineCap = 'round';
  const lines = heavy ? 6 : 4;
  for (let i = 0; i < lines; i++) {
    const side = i % 2 ? 1 : -1;
    const phase = ((t * (heavy ? 3.0 : 2.4) + i * .21) % 1);
    const len = (heavy ? 70 : 50) * k;
    const yb = foot + 6 - phase * (H + 40);
    const u = Math.max(0, Math.min(1, (foot - yb) / Math.max(1, H)));
    const xb = x + side * ((10 + u * Wt * .8) * (.76 + (i % 3) * .14));
    const g2 = c.createLinearGradient(0, yb - len, 0, yb);
    g2.addColorStop(0, hexA(pal.brightHex, 0));
    g2.addColorStop(.45, hexA(i % 2 ? '#ffffff' : pal.brightHex, .28 * (1 - phase * .65)));
    g2.addColorStop(1, hexA(pal.brightHex, 0));
    c.strokeStyle = g2;
    c.lineWidth = i % 2 ? 1.4 : 2.1;
    c.beginPath(); c.moveTo(xb, yb); c.quadraticCurveTo(xb + side * 4, yb - len * .5, xb + side * 9, yb - len); c.stroke();
  }
  for (let i = 0; i < (heavy ? 7 : 4); i++) {
    const phase = ((t * 1.9 + i * .17) % 1);
    const mx = x + Math.sin(i * 4.1) * (14 + phase * 32);
    const my = foot - phase * (H + 20);
    c.fillStyle = hexA('#ffffff', .42 * (1 - phase));
    c.beginPath(); c.arc(mx, my, 1.2 + (i % 2) * .6, 0, TAU); c.fill();
  }
  c.restore();
}

/** 下砸的下冲光痕（从天上拉下来）与起手的一点蓄光；冲锋的速度线。 */
function moveFx(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, t: number): void {
  const lead = g.fighters[0];
  if (!lead) return;
  const col = lead.data.color;
  const sl = m.slam;
  if (sl) {
    if (sl.phase === 'dive') airSheath(c, lead.x, lead.y, sl.heavy, t, col, Math.min(1, sl.t / .05));
    else {
      // 起手停顿：身上一点蓄光（很小、很快）。
      c.save();
      c.globalCompositeOperation = 'lighter';
      const gr = c.createRadialGradient(lead.x, lead.y - 80, 0, lead.x, lead.y - 80, 50);
      gr.addColorStop(0, hexA('#ffffff', .35)); gr.addColorStop(1, hexA(col, 0));
      c.fillStyle = gr; c.fillRect(lead.x - 50, lead.y - 130, 100, 100);
      c.restore();
    }
  }
  const d = m.dash;
  if (d) {
    // 速度线：身后一串长短不一的横向光线，越靠近身体越亮。
    c.save();
    c.globalCompositeOperation = 'lighter';
    const back = -d.dir;
    for (let i = 0; i < 9; i++) {
      const y = lead.y - 20 - i * 17 + Math.sin(i * 7.1 + t * 40) * 4;
      const len = 80 + ((i * 37) % 60) + 140 * Math.min(1, d.t / .1);
      const x0 = lead.x + back * 20, x1 = lead.x + back * (20 + len);
      const gr = c.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, hexA(i % 3 === 0 ? '#ffffff' : col, .7));
      gr.addColorStop(1, hexA(col, 0));
      c.strokeStyle = gr; c.lineWidth = i % 3 === 0 ? 2.5 : 1.5;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    }
    c.restore();
  }
}

/** 次数盾（头顶一排小格）、厚甲（钢灰小盾）、应援团长（青色旗）、带电反伤（红琥珀电刺）、狂暴态底光。 */
function defenseFx(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, t: number): void {
  c.save();
  for (const f of g.fighters) {
    const mob = f.mob;
    if (!mob || f.hp <= 0 || f.y < FLOOR - 200) continue;
    if (m.frenzyT > 0 && !mob.elite) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,70,90,.2)';
      c.beginPath(); c.ellipse(f.x, FLOOR - 4 + mob.depth * 16, 26, 6, 0, 0, TAU); c.fill();
      c.restore();
    }
    if ((mob.thorns ?? 0) > 0) {
      const cy = f.y - 44 + mob.depth * 16;
      const pulseK = .75 + .25 * Math.sin(t * 24);
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(255,88,68,${.85 * pulseK})`;
      c.lineWidth = 2.2;
      c.beginPath(); c.arc(f.x, cy, 34 + Math.sin(t * 16) * 2, 0, TAU); c.stroke();
      c.strokeStyle = `rgba(255,210,120,${.9 * pulseK})`;
      c.lineWidth = 1.8;
      for (let i = 0; i < 8; i++) {
        const a = t * 5 + i * TAU / 8;
        const r0 = 26, r1 = 44 + (i % 2) * 7;
        c.beginPath();
        c.moveTo(f.x + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        c.lineTo(f.x + Math.cos(a + .14) * (r0 + 8), cy + Math.sin(a + .14) * (r0 + 8));
        c.lineTo(f.x + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        c.stroke();
      }
      c.restore();
    }
    const hy = f.y - (mob.elite ? 200 : 128) + mob.depth * 16;
    if (mob.pips && mob.pips > 0) {
      const n = mob.pipMax ?? mob.pips;
      for (let i = 0; i < n; i++) {
        // 小一点、挨紧一点：一群带盾的人站在一起时不会连成一条带子。
        const x = f.x - (n - 1) * 4.5 + i * 9;
        const on = i < mob.pips;
        c.fillStyle = on ? 'rgba(159,243,255,.95)' : 'rgba(159,243,255,.18)';
        c.beginPath(); c.moveTo(x, hy - 4.5); c.lineTo(x + 3.5, hy); c.lineTo(x, hy + 4.5); c.lineTo(x - 3.5, hy); c.closePath(); c.fill();
        if (on) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.stroke(); }
      }
    }
    if (mob.armor) drawArmorMark(c, f.x, hy);
    if (mob.captain) drawFlagMark(c, f.x, f.x - f.facing * 14, f.y - 90, f.facing, t);
  }
  c.restore();
}

/** 稀有道具：地上一束小光柱 + 道具图标；投射物；形态期间头顶一圈倒计时。 */
function rareFx(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, t: number): void {
  for (const r of m.rares) {
    const col = RARE_COLOR[r.kind];
    softPillar(c, r.x, col, .9 + .2 * Math.sin(t * 5), 6, 40, 'front');
    const blink = r.life < 3 ? (Math.sin(t * 18) > 0 ? 1 : .35) : 1;
    c.save();
    c.globalAlpha = blink;
    drawRareObject(c, r.kind, r.x, r.y + Math.sin(t * 3) * 4, 1.15, t, true);
    c.restore();
  }
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const s of m.rshots) {
    if (s.k === 'tri') {
      c.save(); c.translate(s.x, s.y); c.rotate(s.spin);
      c.fillStyle = 'rgba(127,231,255,.35)';
      tri(c, 0, 0, 13);
      c.fillStyle = '#e9fbff';
      tri(c, 0, 0, 7);
      c.restore();
    } else {
      // 烟花：一颗亮点拖一条往回渐隐的尾巴。
      const tl = 40;
      const vl = Math.hypot(s.vx, s.vy) || 1;
      const gr = c.createLinearGradient(s.x, s.y, s.x - s.vx / vl * tl, s.y - s.vy / vl * tl);
      gr.addColorStop(0, 'rgba(255,220,150,.9)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
      c.strokeStyle = gr; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx / vl * tl, s.y - s.vy / vl * tl); c.stroke();
      c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(s.x, s.y, 4, 0, TAU); c.fill();
    }
  }
  c.restore();
  const lead = g.fighters[0];
  const p = m.power;
  if (!p || !lead) return;
  const col = RARE_COLOR[p.kind];
  // 形态期间：脚下一圈本道具颜色的光、头顶道具图标 + 一圈倒计时。
  c.save();
  c.globalCompositeOperation = 'lighter';
  const pool = c.createRadialGradient(lead.x, FLOOR, 0, lead.x, FLOOR, 90);
  pool.addColorStop(0, hexA(col, .35)); pool.addColorStop(1, hexA(col, 0));
  c.fillStyle = pool; c.beginPath(); c.ellipse(lead.x, FLOOR, 90, 20, 0, 0, TAU); c.fill();
  c.restore();
  if (p.kind === 'cymbal') {
    const R = 110 + Math.sin(m.elapsed * 3) * 50;
    for (let i = 0; i < 2; i++) {
      const ang = m.elapsed * 7 + i * Math.PI;
      const cx = lead.x + Math.cos(ang) * R, cy = lead.y - 70 + Math.sin(ang) * R * .45;
      drawCymbalBody(c, cx, cy, 20, t * 20 + i);
    }
  }
  const hx = lead.x, hy = lead.y - 232;
  c.save();
  c.fillStyle = 'rgba(10,10,22,.7)';
  c.beginPath(); c.arc(hx, hy, 19, 0, TAU); c.fill();
  c.strokeStyle = hexA(col, .95); c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.arc(hx, hy, 19, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, p.t / 10)); c.stroke();
  c.restore();
  drawRareObject(c, p.kind, hx, hy + 2, .7, t, false);
}

function tri(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fill();
}

/** 巨型障碍物：warn 时地上的阴影越来越深、头顶隐约有个影子；立着时画出物件 + 血条 + 剩余时间；打爆后碎块飞散淡出。 */
function giantFx(c: CanvasRenderingContext2D, m: MusouDirector, gi: Giant, t: number): void {
  const mood = TAGS[m.song.tag].mood;
  if (gi.phase === 'warn') {
    const k = Math.min(1, gi.t / 1.15);
    c.save();
    c.fillStyle = `rgba(10,6,18,${.25 + .45 * k})`;
    c.beginPath(); c.ellipse(gi.x, FLOOR + 2, 60 + 50 * k, 12 + 8 * k, 0, 0, TAU); c.fill();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(255,90,90,${.3 + .5 * k * (.6 + .4 * Math.sin(t * 20))})`; c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(gi.x, FLOOR + 2, 110, 20, 0, 0, TAU); c.stroke();
    c.restore();
    // 从天上落下来（最后 0.35 秒）。
    const fall = Math.max(0, (gi.t - .8) / .35);
    if (fall > 0) drawGiantObject(c, gi, mood.f1, -(1 - fall * fall) * 520, 1, t);
    return;
  }
  if (gi.phase === 'stand') {
    drawGiantObject(c, gi, mood.f1, 0, 1, t);
    // 血条 + 剩余时间条。
    const w = 150, x = gi.x - w / 2, y = FLOOR - 250;
    c.save();
    c.fillStyle = 'rgba(8,8,16,.8)'; c.beginPath(); c.roundRect(x - 2, y - 2, w + 4, 10, 4); c.fill();
    const gr = c.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, mood.f1); gr.addColorStop(1, mood.f2);
    c.fillStyle = gr; c.beginPath(); c.roundRect(x, y, w * Math.max(0, gi.hp / gi.max), 6, 3); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y + 13); c.lineTo(x + w * Math.max(0, gi.life / gi.lifeMax), y + 13); c.stroke();
    // 头顶醒目的 8 拍过载倒计时环。
    const frac = Math.max(0, Math.min(1, gi.life / gi.lifeMax));
    const urgent = gi.life < 2.5 ? (.6 + .4 * Math.sin(t * 22)) : 1;
    const cy = FLOOR - 285;
    c.fillStyle = 'rgba(8,8,18,.84)';
    c.beginPath(); c.arc(gi.x, cy, 18, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.15)'; c.lineWidth = 3.5;
    c.beginPath(); c.arc(gi.x, cy, 15, 0, TAU); c.stroke();
    const ringCol = frac > .55 ? '#FDE979' : frac > .28 ? '#ff8a5c' : '#ff3b5c';
    c.strokeStyle = hexA(ringCol, urgent); c.lineWidth = 4;
    c.beginPath(); c.arc(gi.x, cy, 15, -Math.PI / 2, -Math.PI / 2 + TAU * frac); c.stroke();
    c.fillStyle = ringCol; c.font = `900 12px ${UI_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(Math.ceil(gi.life).toString(), gi.x, cy + .5);
    c.restore();
    return;
  }
  const k = Math.min(1, gi.t / 1);
  if (gi.phase === 'gone') { drawGiantObject(c, gi, mood.f1, 0, 1 - k, t, k * 40); return; }
  // 打爆 / 超时震爆：几块碎片往外飞、旋转、淡出。
  c.save();
  const R = rng(Math.floor(gi.x * 13));
  for (let i = 0; i < 9; i++) {
    const dir = R() < .5 ? -1 : 1;
    const vx = dir * (120 + R() * 300), vy = -(300 + R() * 380);
    const px = gi.x + vx * k, py = FLOOR - 120 + vy * k + 900 * k * k;
    c.globalAlpha = Math.max(0, 1 - k);
    c.save(); c.translate(px, py); c.rotate(k * (4 + R() * 6) * dir);
    c.fillStyle = gi.phase === 'blown' ? (i % 2 ? '#2a0d18' : '#ff3b5c') : (i % 2 ? '#1d2342' : mood.f1);
    c.fillRect(-14 - R() * 10, -10 - R() * 8, 28 + R() * 20, 20 + R() * 16);
    c.restore();
  }
  c.restore();
}

/** 升降舞台：一块发光圆台（台面 + 侧面一圈），升起 / 下沉；台边一圈护栏光；快沉的时候整块闪。 */
function liftFx(c: CanvasRenderingContext2D, l: Lift, t: number, color: string): void {
  const h = liftH(l);
  const blink = l.phase === 'up' && l.t > l.up - 2 ? (Math.sin(t * 16) > 0 ? 1 : .45) : 1;
  const k = l.phase === 'rise' ? Math.min(1, l.t / .5) : l.phase === 'sink' ? Math.max(0, 1 - l.t / .6) : 1;
  softPillar(c, l.x, color, .8 * k * blink, 30, l.r * 1.05, 'back', t, 6);
  drawLiftObject(c, l, h, k, blink, color);
}

/* ---- P4 舞台危机：高空激光网 / 聚光灯死线 / 空中高压电球 ---- */

function soloBack(c: CanvasRenderingContext2D, s: SpotlightSolo, lead: Fighter | undefined, t: number): void {
  const fade = Math.min(1, s.t / .35, Math.max(0, s.dur - s.t) / .35);
  if (fade <= .01) return;
  c.save();
  c.fillStyle = `rgba(4,3,14,${.56 * fade})`;
  c.fillRect(-260, -260, W + 520, H + 520);
  c.restore();
  softPillar(c, s.x, '#ffe9a8', 1.35 * fade, 54, s.r, 'back', t, 8);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(s.x, FLOOR + 1);
  c.scale(1, .24);
  c.strokeStyle = s.inZone ? `rgba(255,233,168,${.75 * fade})` : `rgba(255,90,120,${.85 * fade})`;
  c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, s.r * .92, 0, TAU); c.stroke();
  c.restore();
  // 地面指示移动方向的小箭头。
  const dir = Math.sign(s.vx) || 1;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = `rgba(255,240,180,${.5 * fade})`;
  for (let i = -1; i <= 1; i++) {
    const ax = s.x + dir * (i * 38 + ((t * 90) % 38) - 19);
    c.beginPath();
    c.moveTo(ax + dir * 9, FLOOR + 1); c.lineTo(ax - dir * 5, FLOOR - 4); c.lineTo(ax - dir * 5, FLOOR + 6);
    c.closePath(); c.fill();
  }
  c.restore();
  // 离开聚光灯时主角头顶画警告倒计时环。
  if (lead && !s.inZone && s.outT > .12 && lead.hp > 0) {
    const frac = Math.min(1, s.outT / 1.2);
    c.save();
    c.strokeStyle = 'rgba(255,70,100,.9)';
    c.lineWidth = 3.5;
    c.beginPath(); c.arc(lead.x, lead.y - 210, 14, -Math.PI / 2, -Math.PI / 2 + TAU * frac); c.stroke();
    c.restore();
  }
}

function soloFront(c: CanvasRenderingContext2D, s: SpotlightSolo, _lead: Fighter | undefined, t: number): void {
  const fade = Math.min(1, s.t / .35, Math.max(0, s.dur - s.t) / .35);
  if (fade > .01) softPillar(c, s.x, '#ffe9a8', .9 * fade, 54, s.r, 'front', t, 0);
}

function lasersFx(c: CanvasRenderingContext2D, nets: LaserNet[], t: number): void {
  for (const net of nets) {
    c.save();
    if (net.phase === 'warn') {
      const k = Math.min(1, net.t / net.warnDur);
      const pulseK = .45 + .55 * Math.abs(Math.sin(k * Math.PI * 3));
      c.globalCompositeOperation = 'lighter';
      c.setLineDash([14, 10]);
      c.lineDashOffset = -t * 140;
      c.strokeStyle = `rgba(255,80,145,${(.45 + .45 * k) * pulseK})`;
      c.lineWidth = 1.8 + k * 1.4;
      for (const ly of net.ys) {
        c.beginPath(); c.moveTo(-40, ly); c.lineTo(W + 40, ly); c.stroke();
      }
      c.setLineDash([]);
    } else if (net.phase === 'fire') {
      const fade = Math.min(1, net.t / .08, Math.max(0, net.fireDur - net.t) / .12);
      c.globalCompositeOperation = 'lighter';
      for (const ly of net.ys) {
        const h = 18 * fade;
        const gr = c.createLinearGradient(0, ly - h, 0, ly + h);
        gr.addColorStop(0, 'rgba(255,50,120,0)');
        gr.addColorStop(.5, `rgba(255,70,145,${.75 * fade})`);
        gr.addColorStop(1, 'rgba(255,50,120,0)');
        c.fillStyle = gr;
        c.fillRect(-40, ly - h, W + 80, h * 2);
        c.fillStyle = `rgba(255,245,250,${.95 * fade})`;
        c.fillRect(-40, ly - 2.2, W + 80, 4.4);
      }
    } else {
      const fade = Math.max(0, 1 - net.t / .45);
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(127,231,255,${.9 * fade})`;
      c.lineWidth = 3;
      for (const ly of net.ys) {
        c.beginPath(); c.moveTo(-40, ly); c.lineTo(W + 40, ly); c.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const bx = 110 + i * 150;
        c.beginPath(); c.moveTo(bx, net.ys[0]); c.lineTo(bx + Math.sin(i * 5 + t * 30) * 18, (net.ys[0] + FLOOR) / 2); c.lineTo(bx, FLOOR); c.stroke();
      }
    }
    // 两侧高空灯箱：可被技能/弹幕/高跳打爆。
    for (const nd of net.nodes) drawLaserNodeObject(c, nd, net.phase === 'fire', t);
    c.restore();
  }
}

function orbsFx(c: CanvasRenderingContext2D, orbs: SkyOrb[], t: number): void {
  for (const o of orbs) drawSkyOrbObject(c, o, t);
}

const BALL_PALETTE = ['#9ff3ff', '#48e5ff', '#FDE979', '#ff9b42', '#ff5ea8', '#ffffff'] as const;

/** 共鸣弹球：霓虹尾迹、旋转经纬线与档位光环，地面留投影方便接球。 */
function ballsFx(c: CanvasRenderingContext2D, balls: StageBall[], t: number): void {
  for (const b of balls) {
    const blink = b.life < 2 ? (Math.sin(t * 20) > 0 ? 1 : .35) : 1;
    const col = BALL_PALETTE[Math.min(5, b.level)];
    c.save();
    c.globalAlpha = blink;
    // 地面投影（越靠近地面越实）。
    const air = Math.max(0, FLOOR - b.y);
    const shK = Math.max(.35, 1 - air / 360);
    c.fillStyle = 'rgba(4,4,14,.32)';
    c.beginPath();
    c.ellipse(b.x, FLOOR - 2, b.r * 1.05 * shK, b.r * .25 * shK, 0, 0, TAU);
    c.fill();
    // 拖尾光带。
    if (b.trail.length >= 2) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (let i = 1; i < b.trail.length; i++) {
        const u = i / b.trail.length;
        c.strokeStyle = hexA(col, .42 * u);
        c.lineWidth = b.r * .95 * u;
        c.beginPath();
        c.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
        c.lineTo(b.trail[i].x, b.trail[i].y);
        c.stroke();
      }
      c.restore();
    }
    // 外晕柔光。
    c.save();
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(b.x, b.y, b.r * .4, b.x, b.y, b.r * (1.8 + b.level * .12));
    halo.addColorStop(0, hexA(col, .52));
    halo.addColorStop(1, hexA(col, 0));
    c.fillStyle = halo;
    c.beginPath(); c.arc(b.x, b.y, b.r * (1.8 + b.level * .12), 0, TAU); c.fill();
    c.restore();
    // 球体核心与旋转经纬环。
    c.save();
    c.translate(b.x, b.y);
    const gr = c.createRadialGradient(-b.r * .3, -b.r * .3, 2, 0, 0, b.r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(.45, col);
    gr.addColorStop(1, '#181436');
    c.fillStyle = gr;
    c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill();
    c.save();
    c.rotate(b.spin);
    c.strokeStyle = 'rgba(255,255,255,.72)';
    c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(0, 0, b.r * .88, b.r * .32, 0, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(0, 0, b.r * .32, b.r * .88, 0, 0, TAU); c.stroke();
    c.restore();
    c.strokeStyle = b.flash > 0 ? '#ffffff' : hexA(col, .95);
    c.lineWidth = b.flash > 0 ? 3.5 : 2.2;
    c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.stroke();
    if (b.level >= 3) {
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = hexA(col, .65);
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, b.r + 7 + Math.sin(t * 14) * 2, t * 5, t * 5 + Math.PI * 1.3); c.stroke();
    }
    if (b.flash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,255,255,${Math.min(1, b.flash * 6) * .75})`;
      c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill();
    }
    c.fillStyle = '#ffffff';
    star4(c, 0, 0, b.r * .34);
    c.restore();
    c.restore();
  }
}

/** 半空鼓点串：霓虹引导连线 + 跟拍收缩的当前目标鼓 + 压轴金色大鼓。 */
function padChainsFx(c: CanvasRenderingContext2D, m: MusouDirector, chains: SkyPadChain[], t: number): void {
  const beatU = m.beatFrac();
  for (const ch of chains) {
    const blink = !ch.done && ch.life < 2.2 ? (Math.sin(t * 18) > 0 ? 1 : .35) : 1;
    // 连线引导：连接未踩过的鼓点，流动虚线直接指出路线方向。
    if (!ch.done && ch.next < ch.pads.length - 1) {
      c.save();
      c.globalAlpha = blink * .65;
      c.globalCompositeOperation = 'lighter';
      c.setLineDash([8, 8]);
      c.lineDashOffset = -t * 75;
      c.strokeStyle = 'rgba(127,231,255,.75)';
      c.lineWidth = 2.5;
      c.beginPath();
      for (let i = ch.next; i < ch.pads.length; i++) {
        const p = ch.pads[i];
        if (i === ch.next) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    for (let i = 0; i < ch.pads.length; i++) {
      const p = ch.pads[i];
      const last = i === ch.pads.length - 1;
      const col = last ? '#FDE979' : i === ch.next ? '#7fe7ff' : '#ff6fa8';
      if (p.hit) {
        if (p.hitT < .45) {
          const u = p.hitT / .45;
          ring(c, p.x, p.y, p.r + 48 * ease(u), col, .85 * (1 - u), .35);
        }
        continue;
      }
      const isCur = i === ch.next;
      const a = (isCur ? 1 : .58) * blink;
      c.save();
      c.globalAlpha = a;
      c.globalCompositeOperation = 'lighter';
      const gr = c.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r * 1.45);
      gr.addColorStop(0, hexA(col, isCur ? .48 : .24));
      gr.addColorStop(1, hexA(col, 0));
      c.fillStyle = gr;
      c.beginPath(); c.arc(p.x, p.y, p.r * 1.45, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(14,12,30,.75)';
      c.beginPath(); c.arc(p.x, p.y, p.r * .78, 0, TAU); c.fill();
      c.strokeStyle = hexA(col, isCur ? .98 : .72);
      c.lineWidth = isCur ? 3.2 : 2;
      c.beginPath(); c.arc(p.x, p.y, p.r * .78, 0, TAU); c.stroke();
      if (isCur) {
        // 跟拍收缩环：像脚下节拍圈一样，自然诱发跳跃/冲锋踩过去。
        const rr = p.r * (.9 + (1 - beatU) * .7);
        c.strokeStyle = hexA('#ffffff', .3 + .55 * beatU);
        c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, rr, 0, TAU); c.stroke();
      }
      c.fillStyle = last ? '#FDE979' : '#ffffff';
      if (last) star4(c, p.x, p.y, p.r * .38);
      else {
        const s = p.r * .26 * (isCur ? 1 + .15 * Math.sin(t * 10) : 1);
        c.beginPath(); c.moveTo(p.x, p.y - s); c.lineTo(p.x + s, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s, p.y); c.closePath(); c.fill();
      }
      c.restore();
    }
  }
}

/* ---- 屏幕边缘指示箭头 ---- */

export function drawEdgeArrows(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, cam: CamView, w: number, h: number): void {
  const k = w / W;
  const toScreen = (wx: number) => ((wx - cam.fx) * cam.z + W / 2 + cam.ox) * k;
  const items: { x: number; color: string; kind: string }[] = [];
  for (const ch of m.chests) if (ch.state === 0) items.push({ x: ch.x, color: '#FDE979', kind: 'chest' });
  for (const r of m.rares) items.push({ x: r.x, color: RARE_COLOR[r.kind], kind: 'rare' });
  for (const d of m.drops) items.push({ x: d.x, color: d.card.cat === 'evo' ? '#E9C46A' : '#FDE979', kind: 'card' });
  for (const l of m.lifts) if (l.phase !== 'sink') items.push({ x: l.x, color: TAGS[m.song.tag].mood.f2, kind: 'lift' });
  for (const gi of m.giants) if (gi.phase === 'warn' || gi.phase === 'stand') items.push({ x: gi.x, color: gi.phase === 'stand' ? '#ff4d6d' : TAGS[m.song.tag].mood.f1, kind: 'giant' });
  for (const o of m.orbs) items.push({ x: o.x, color: '#FDE979', kind: 'orb' });
  for (const b of m.balls) items.push({ x: b.x, color: BALL_PALETTE[Math.min(5, b.level)], kind: 'ball' });
  for (const pc of m.padChains) if (!pc.done && pc.next < pc.pads.length) items.push({ x: pc.pads[pc.next].x, color: '#7fe7ff', kind: 'pad' });
  for (const chg of m.charges) if (chg.broken < 0) items.push({ x: chg.x, color: '#ffd23f', kind: 'danger' });
  for (const f of g.fighters) if (f.mob?.elite && f.hp > 0) items.push({ x: f.x, color: '#ff5a5a', kind: 'danger' });
  for (const f of g.fighters) if (f.mob?.captain && f.hp > 0) items.push({ x: f.x, color: '#9ff3ff', kind: 'danger' });
  const t = g.age;
  for (const it of items) {
    const sx = toScreen(it.x);
    if (sx > 14 && sx < w - 14) continue;
    const left = sx <= 14;
    const x = left ? 22 : w - 22, y = h * .6;
    const pulse = 1 + .12 * Math.sin(t * 8);
    c.save();
    c.translate(x, y);
    c.scale(left ? -pulse : pulse, pulse);
    c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, 26);
    gr.addColorStop(0, hexA(it.color, .45)); gr.addColorStop(1, hexA(it.color, 0));
    c.fillStyle = gr; c.fillRect(-26, -26, 52, 52);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = it.color;
    c.beginPath(); c.moveTo(12, 0); c.lineTo(-6, -11); c.lineTo(-2, 0); c.lineTo(-6, 11); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
}

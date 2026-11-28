import { FLOOR } from '../game/constants.ts';
import { drawDropsWorld } from './musouDrops.ts';
import type { FightGame } from '../game/game.ts';
import type { MusouDirector } from '../musou/director.ts';
import { SHIFT_TIME } from '../musou/constants.ts';
import { TAGS, type Mood, type SongTag } from '../musou/songs.ts';
import { isLiteFx } from './fxQuality.ts';
import { drawJuiceBack, drawJuiceFront } from './musouJuice.ts';
import { drawMineObject, drawMobShotObject, drawPropCheer, drawPropCrate, drawPropRig, drawPropSpeaker, gemStamp } from './musouObjects.ts';
import type { MusouVisibility } from './musouCam.ts';
import { reducedMotion } from '../ui/motion.ts';

/* 音浪无双的画面层：氛围（调色 + 环境光/粒子，只在切歌时换）、机关、武器、星屑、荧光棒。
   全部是 2D 路径 + 少量渐变，不用 shadowBlur；粒子数固定上限。 */

const W = 960, H = 540;
const TAU = Math.PI * 2;

interface Mote { x: number; y: number; v: number; s: number; p: number }
let motes: Mote[] = [];
let moteFor: SongTag | null = null;
let moteGame: FightGame | null = null;

function seedMotes(tag: SongTag): void {
  const n = tag === 'dark' ? 14 : 26;
  motes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, v: .5 + Math.random(), s: .6 + Math.random() * .8, p: Math.random() * TAU }));
  moteFor = tag;
}

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

/** 切歌过场：前 1 秒白闪清场，1.0–1.6 秒新曲风从屏幕中线向两侧擦开。 */
function moodMix(m: MusouDirector): { from: Mood; to: Mood; k: number; wipe: number } {
  const to = TAGS[m.mood].mood;
  if (m.phase !== 'shift') return { from: to, to, k: 1, wipe: -1 };
  const from = TAGS[m.prevMood].mood;
  const k = Math.max(0, Math.min(1, (m.shiftT - 1) / .6));
  return { from, to: k >= 1 ? to : from, k, wipe: k > 0 && k < 1 ? k : -1 };
}

/** 长街之上、人物之下：调色、背光（暗场追光 / 宏大光柱）、机关、地雷。 */
export function drawMusouBack(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  if (moteGame !== g) { moteGame = g; moteFor = null; }
  const { from, to, wipe } = moodMix(m);
  const mood = wipe >= 0 ? to : from;
  if (moteFor !== m.mood && (m.phase !== 'shift' || wipe >= 0)) seedMotes(m.mood);
  grade(c, from);
  if (wipe >= 0) {
    // 新曲风从中线向两边擦开。
    const half = W / 2 * easeOut(wipe);
    c.save();
    c.beginPath();
    c.rect(W / 2 - half, 0, half * 2, H);
    c.clip();
    grade(c, TAGS[m.mood].mood);
    c.restore();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = hexA(TAGS[m.mood].mood.c1, .55 * (1 - wipe));
    c.fillRect(W / 2 - half - 3, 0, 6, H);
    c.fillRect(W / 2 + half - 3, 0, 6, H);
    c.restore();
  }
  backLights(c, g, mood, m.mood);
  drawSunAnomalyBack(c, g, m);
  drawProps(c, g, m);
  drawJuiceBack(c, g, m);
}

function easeOut(k: number): number { return 1 - (1 - k) ** 3; }

function grade(c: CanvasRenderingContext2D, mood: Mood): void {
  c.save();
  c.globalCompositeOperation = 'soft-light';
  c.fillStyle = hexA(mood.tint, Math.min(.6, mood.tintAlpha * 2.4));
  c.fillRect(-260, -260, W + 520, H + 520);
  c.restore();
  if (mood.dark > 0) {
    const v = c.createRadialGradient(W / 2, H * .62, H * .25, W / 2, H * .55, W * .62);
    v.addColorStop(0, 'rgba(5,4,14,0)');
    v.addColorStop(1, `rgba(5,4,14,${mood.dark})`);
    c.fillStyle = v;
    c.fillRect(-260, -260, W + 520, H + 520);
  }
}

/** 柔和光束：顶窄底宽，中轴最亮，两侧横向渐隐到透明；落点一圈柔光。 */
function beam(c: CanvasRenderingContext2D, x0: number, ang: number, top: number, bottom: number, color: string, a: number): void {
  const len = (FLOOR + 6) / Math.cos(ang);
  c.save();
  c.translate(x0, 0);
  c.rotate(-ang);
  const gr = c.createLinearGradient(-bottom, 0, bottom, 0);
  gr.addColorStop(0, hexA(color, 0));
  gr.addColorStop(.5, hexA(color, a));
  gr.addColorStop(1, hexA(color, 0));
  c.fillStyle = gr;
  c.beginPath();
  c.moveTo(-top, 0);
  c.lineTo(top, 0);
  c.lineTo(bottom, len);
  c.lineTo(-bottom, len);
  c.closePath();
  c.fill();
  c.restore();
  const fx = x0 + Math.tan(ang) * (FLOOR + 6);
  const pool = c.createRadialGradient(fx, FLOOR + 4, 0, fx, FLOOR + 4, bottom * 1.1);
  pool.addColorStop(0, hexA(color, a * 1.2));
  pool.addColorStop(1, hexA(color, 0));
  c.save();
  c.translate(0, FLOOR + 4);
  c.scale(1, .18);
  c.translate(0, -(FLOOR + 4));
  c.fillStyle = pool;
  c.fillRect(fx - bottom * 1.2, FLOOR + 4 - bottom * 1.2, bottom * 2.4, bottom * 2.4);
  c.restore();
}

function backLights(c: CanvasRenderingContext2D, g: FightGame, mood: Mood, tag: SongTag): void {
  const t = g.age;
  c.save();
  c.globalCompositeOperation = 'lighter';
  if (mood.mote === 'spot') {
    beam(c, 260, Math.sin(t * .6) * .32, 10, 90, mood.c1, .16);
    beam(c, 700, Math.sin(t * .5 + 2) * .32, 10, 90, mood.c2, .16);
  } else if (mood.mote === 'feather') {
    for (let i = 0; i < 3; i++) beam(c, 180 + i * 300 + Math.sin(t * .3 + i) * 30, 0, 18, 70, mood.c2, .07 + .03 * Math.sin(t * 1.2 + i * 2));
  }
  c.restore();
  void tag;
}

/** 人物之上：武器、星屑、荧光棒、环境粒子、切歌白闪。 */
export function drawMusouFront(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, visible: MusouVisibility): void {
  const lead = g.fighters[0];
  const accent = lead?.data.color ?? '#ff3b7f';
  drawWeapons(c, g, m, accent);
  drawGems(c, g, m, visible);
  drawMobShots(c, m);
  drawMotes(c, g, m);
  drawSunAnomalyFront(c, g, m);
  drawJuiceFront(c, g, m);
  drawDropsWorld(c, g, m);
  if (m.phase === 'shift' && m.shiftT < .5) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(255,240,250,${.5 * (1 - m.shiftT / .5)})`;
    c.fillRect(-260, -260, W + 520, H + 520);
    c.restore();
  }
  void SHIFT_TIME;
}

function drawMotes(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  if (!moteFor) return;
  const mood = TAGS[moteFor].mood;
  const dt = 1 / 60;
  const t = g.age;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const p of motes) {
    if (mood.mote === 'spark') {
      p.y -= p.v * 70 * dt; p.x += Math.sin(t * 2 + p.p) * .4;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      const fl = .5 + .5 * Math.sin(t * 9 + p.p);
      c.fillStyle = hexA(p.p > 3 ? mood.c1 : mood.c2, .35 + .4 * fl);
      c.fillRect(p.x, p.y, 2 * p.s, 5 * p.s);
    } else if (mood.mote === 'bubble') {
      p.y -= p.v * 30 * dt; p.x += Math.sin(t + p.p) * .3;
      if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
      if (p.p > 4) {
        const r = 2.5 * p.s * (.6 + .4 * Math.sin(t * 4 + p.p));
        c.fillStyle = hexA(mood.c1, .7);
        c.beginPath(); c.moveTo(p.x, p.y - r * 2); c.quadraticCurveTo(p.x, p.y, p.x + r * 2, p.y); c.quadraticCurveTo(p.x, p.y, p.x, p.y + r * 2); c.quadraticCurveTo(p.x, p.y, p.x - r * 2, p.y); c.quadraticCurveTo(p.x, p.y, p.x, p.y - r * 2); c.fill();
      } else {
        const r = 6 * p.s;
        c.strokeStyle = hexA(mood.c2, .35); c.lineWidth = 1.2;
        c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
        c.fillStyle = hexA('#ffffff', .4); c.beginPath(); c.arc(p.x - r * .35, p.y - r * .35, r * .25, 0, TAU); c.fill();
      }
    } else if (mood.mote === 'feather') {
      p.y += p.v * 22 * dt; p.x += Math.sin(t * .8 + p.p) * .6;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
      c.save(); c.translate(p.x, p.y); c.rotate(Math.sin(t + p.p) * .8);
      c.fillStyle = hexA(mood.c1, .45);
      c.beginPath(); c.ellipse(0, 0, 2.2 * p.s, 7 * p.s, 0, 0, TAU); c.fill();
      c.restore();
    } else {
      // 暗场：追光里飘着的少量光尘。
      p.y -= p.v * 12 * dt; p.x += Math.sin(t * .7 + p.p) * .25;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      c.fillStyle = hexA(mood.c1, .25 + .25 * Math.sin(t * 3 + p.p));
      c.beginPath(); c.arc(p.x, p.y, 1.4 * p.s, 0, TAU); c.fill();
    }
  }
  c.restore();
  void m;
}

/* ---- 机关 ---- */

function drawProps(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  const t = g.age;
  for (const p of m.props) {
    if (p.x < -160 || p.x > W + 160) continue;
    if (p.kind === 'cheer') {
      drawPropCheer(c, p.x, t, Math.min(1, p.t / 2));
      continue;
    }
    if (p.kind === 'speaker' && p.state === 0) {
      drawPropSpeaker(c, p.x, t);
      pips(c, p.x, FLOOR - 172, p.hp, 3);
    } else if (p.kind === 'crate' && p.state === 0) {
      drawPropCrate(c, p.x, t);
      pips(c, p.x, FLOOR - 60, p.hp, 2);
    } else if (p.kind === 'rig') {
      const fall = p.state === 1 ? Math.min(1, p.t / .45) : 0;
      drawPropRig(c, p.x, fall, p.state === 0, t);
    }
  }
  for (const mn of m.mines) drawMineObject(c, mn.x, 1 - mn.t / .6);
}

function pips(c: CanvasRenderingContext2D, x: number, y: number, n: number, max: number): void {
  for (let i = 0; i < max; i++) {
    c.fillStyle = i < n ? '#ffffff' : 'rgba(255,255,255,.2)';
    c.fillRect(x - max * 6 + i * 12 + 2, y, 8, 3);
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

function noteGlyph(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath(); c.ellipse(x, y, r, r * .72, -.4, 0, TAU); c.fill();
  c.fillRect(x + r * .7, y - r * 3.2, r * .32, r * 3.2);
  c.beginPath(); c.moveTo(x + r * 1.02, y - r * 3.2); c.quadraticCurveTo(x + r * 2.4, y - r * 2.4, x + r * 1.6, y - r * 1.3); c.lineTo(x + r * 1.02, y - r * 2.2); c.fill();
}

/* ---- 武器 ---- */

function drawWeapons(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, accent: string): void {
  const a = m.arms;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const e of a.fx) {
    const k = 1 - e.life / e.max;
    const col = e.evo ? '#E9C46A' : accent;
    switch (e.k) {
      case 'ring': case 'ring2': case 'pop': case 'mine': case 'amp': case 'speaker': case 'encore': case 'clear': {
        const R = e.r * easeOut(Math.min(1, k * 1.3));
        const alpha = (1 - k) * (e.k === 'clear' ? .9 : .7);
        const tint = e.k === 'mine' ? '#FDE979' : e.k === 'amp' ? '#a78bfa' : e.k === 'speaker' ? '#ff6fa8' : e.k === 'clear' ? '#ffffff' : e.k === 'pop' ? '#ff8fbf' : col;
        c.save();
        c.translate(e.x, e.k === 'encore' || e.k === 'clear' ? e.y : e.y - 40);
        c.scale(1, e.k === 'encore' || e.k === 'clear' ? 1 : .42);
        c.strokeStyle = hexA(tint, alpha);
        c.lineWidth = (e.k === 'speaker' || e.k === 'clear' ? 16 : 9) * (1 - k) + 2;
        c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
        const gr = c.createRadialGradient(0, 0, R * .4, 0, 0, R);
        gr.addColorStop(0, hexA(tint, 0));
        gr.addColorStop(1, hexA(tint, alpha * .35));
        c.fillStyle = gr;
        c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
        c.restore();
        break;
      }
      case 'quake': {
        const reach = 380 + e.lv * 40;
        const x = e.x + e.dir * reach * easeOut(k);
        const h = 26 + e.lv * 4;
        c.fillStyle = hexA(col, .55 * (1 - k));
        for (let i = 0; i < 6; i++) {
          const xx = x - e.dir * i * 22, hh = h * (1 - i / 6) * (.6 + .4 * Math.sin(i * 2.3 + g.age * 20));
          c.beginPath(); c.moveTo(xx - 10, FLOOR); c.lineTo(xx, FLOOR - hh); c.lineTo(xx + 10, FLOOR); c.fill();
        }
        c.fillStyle = hexA('#ffffff', .25 * (1 - k));
        c.fillRect(Math.min(e.x, x), FLOOR - 2, Math.abs(x - e.x), 3);
        break;
      }
      case 'beam': {
        const h = (e.w ?? 34) * (1 - k * .7);
        const gr = c.createLinearGradient(0, e.y - h, 0, e.y + h);
        gr.addColorStop(0, hexA(col, 0));
        gr.addColorStop(.5, hexA('#ffffff', .85 * (1 - k)));
        gr.addColorStop(1, hexA(col, 0));
        c.fillStyle = gr;
        const x0 = e.x, x1 = e.x + e.dir * e.r;
        c.fillRect(Math.min(x0, x1), e.y - h, Math.abs(x1 - x0), h * 2);
        c.fillStyle = hexA(col, .5 * (1 - k));
        c.fillRect(Math.min(x0, x1), e.y - h * .3, Math.abs(x1 - x0), h * .6);
        break;
      }
      case 'cone': {
        const half = e.w ?? .6;
        for (let i = 0; i < 3; i++) {
          const kk = Math.min(1, k * 1.4 + i * .18);
          if (kk >= 1) continue;
          c.strokeStyle = hexA(col, .7 * (1 - kk));
          c.lineWidth = 5 * (1 - kk) + 1;
          c.beginPath();
          const r = e.r * kk;
          if (half >= Math.PI - .01) c.arc(e.x, e.y, r, 0, TAU);
          else if (e.dir > 0) c.arc(e.x, e.y, r, -half, half);
          else c.arc(e.x, e.y, r, Math.PI - half, Math.PI + half);
          c.stroke();
        }
        break;
      }
      case 'wave': {
        // 音浪斩：一道新月形的柔光往前推，中间最亮、两头渐隐，走到头淡掉。
        const r = e.r * easeOut(Math.min(1, k * 1.15));
        const thick = 26 * (1 - k) + 6;
        const half = .62;
        const a0 = e.dir > 0 ? -half : Math.PI - half, a1 = e.dir > 0 ? half : Math.PI + half;
        const gr = c.createRadialGradient(e.x, e.y, Math.max(1, r - thick), e.x, e.y, r + thick * .4);
        gr.addColorStop(0, hexA(col, 0));
        gr.addColorStop(.72, hexA(col, .55 * (1 - k)));
        gr.addColorStop(.9, hexA('#ffffff', .65 * (1 - k)));
        gr.addColorStop(1, hexA(col, 0));
        c.fillStyle = gr;
        c.beginPath();
        c.arc(e.x, e.y, r + thick * .4, a0, a1);
        c.arc(e.x, e.y, Math.max(1, r - thick), a1, a0, true);
        c.closePath();
        c.fill();
        break;
      }
      case 'chain': {
        // 和弦连锁：两点之间一道折线电弧，外层柔光、内层白芯。
        const x1 = e.x + e.r, y1 = e.y + (e.w ?? 0);
        const segs = 5, jitter = 10;
        c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [lw, cl, al] of [[7, col, .35], [2.2, '#ffffff', .9]] as const) {
          c.strokeStyle = hexA(cl, al * (1 - k));
          c.lineWidth = lw;
          c.beginPath();
          c.moveTo(e.x, e.y);
          for (let i = 1; i < segs; i++) {
            const u = i / segs;
            c.lineTo(e.x + (x1 - e.x) * u + Math.sin(i * 7.3 + e.x) * jitter * .4, e.y + (y1 - e.y) * u + Math.sin(i * 3.1 + e.r) * jitter);
          }
          c.lineTo(x1, y1);
          c.stroke();
        }
        break;
      }
      case 'rig': {
        const fall = Math.min(1, k / .58);
        if (fall < 1) {
          c.strokeStyle = hexA('#FDE979', .5 * (1 - fall)); c.lineWidth = 2;
          c.beginPath(); c.ellipse(e.x, FLOOR, e.r, e.r * .22, 0, 0, TAU); c.stroke();
          const y = -40 + (FLOOR + 40) * fall * fall;
          c.fillStyle = hexA('#ffe6a8', .9);
          c.fillRect(e.x - 22, y - 12, 44, 12);
          c.fillStyle = hexA('#ffe6a8', .25);
          c.beginPath(); c.moveTo(e.x - 10, y); c.lineTo(e.x + 10, y); c.lineTo(e.x + 30, FLOOR); c.lineTo(e.x - 30, FLOOR); c.fill();
        } else {
          const kk = (k - .58) / .42;
          c.strokeStyle = hexA('#ffe6a8', .8 * (1 - kk)); c.lineWidth = 8 * (1 - kk) + 1;
          c.beginPath(); c.ellipse(e.x, FLOOR - 4, e.r * (.6 + kk * .6), e.r * .2, 0, 0, TAU); c.stroke();
        }
        break;
      }
      case 'aura': {
        const pulse = .85 + .15 * Math.sin(g.age * 6);
        c.save();
        c.translate(e.x, e.y - 4);
        c.scale(1, .28);
        const gr = c.createRadialGradient(0, 0, e.r * .55, 0, 0, e.r * pulse);
        gr.addColorStop(0, hexA(col, 0));
        gr.addColorStop(.85, hexA(col, .22));
        gr.addColorStop(1, hexA(col, 0));
        c.fillStyle = gr;
        c.beginPath(); c.arc(0, 0, e.r, 0, TAU); c.fill();
        c.restore();
        break;
      }
    }
  }
  for (const s of a.shots) {
    const col = s.evo ? '#E9C46A' : s.k === 'pick' ? '#76e7ff' : accent;
    if (s.k === 'note') {
      c.fillStyle = hexA(col, .3);
      c.beginPath(); c.arc(s.x - s.vx * .02, s.y - s.vy * .02, 10, 0, TAU); c.fill();
      c.fillStyle = hexA('#ffffff', .95);
      noteGlyph(c, s.x, s.y + 6, 6);
    } else {
      c.save();
      c.translate(s.x, s.y);
      c.rotate(Math.atan2(s.vy, s.vx) + Math.PI / 2);
      c.fillStyle = hexA(col, .35);
      c.fillRect(-3, 6, 6, 22);
      c.fillStyle = hexA('#ffffff', .95);
      c.beginPath(); c.moveTo(0, 10); c.quadraticCurveTo(-11, -2, -8, -9); c.quadraticCurveTo(0, -13, 8, -9); c.quadraticCurveTo(11, -2, 0, 10); c.fill();
      c.restore();
    }
  }
  for (const o of a.orbs) {
    const col = o.evo ? '#E9C46A' : accent;
    if (o.k === 'disc') {
      c.fillStyle = hexA('#10121c', 1);
      c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.arc(o.x, o.y, 15, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1;
      c.beginPath(); c.arc(o.x, o.y, 11, 0, TAU); c.stroke();
      c.fillStyle = col;
      c.beginPath(); c.arc(o.x, o.y, 5, 0, TAU); c.fill();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = hexA(col, .5); c.lineWidth = 2;
      c.beginPath(); c.arc(o.x, o.y, 17, g.age * 8, g.age * 8 + 1.4); c.stroke();
    } else {
      c.fillStyle = hexA(col, .28);
      c.beginPath(); c.arc(o.x, o.y, o.evo ? 16 : 11, 0, TAU); c.fill();
      c.fillStyle = o.evo ? '#fff3c4' : '#ffffff';
      if (o.evo) star4(c, o.x, o.y, 10); else noteGlyph(c, o.x - 2, o.y + 5, 5.5);
    }
  }
  c.restore();
}

function drawGems(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, visible: MusouVisibility): void {
  if (!m.gems.length) return;
  const stamp = gemStamp();
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const gm of m.gems) {
    const r = Math.min(9, 4 + gm.v * .8) * (.85 + .15 * Math.sin(g.age * 8 + gm.x));
    const half = r * 2;
    if (!visible(gm.x, gm.y, half)) continue;
    c.drawImage(stamp, gm.x - half, gm.y - half, half * 2, half * 2);
  }
  c.restore();
}

function drawMobShots(c: CanvasRenderingContext2D, m: MusouDirector): void {
  for (const s of m.shots) drawMobShotObject(c, s.x, s.y, s.spin);
}

/* ---- 天地异象 · 烈日 ---- */

const SUN_EMB_MAX = 18;
const sunEmbers: Mote[] = Array.from({ length: SUN_EMB_MAX }, () => ({
  x: Math.random() * W, y: Math.random() * H, v: .5 + Math.random(), s: .7 + Math.random() * .9, p: Math.random() * TAU,
}));

function sunStrength(m: MusouDirector): number {
  const rk = m.anomaly?.kind === 'sun' ? m.anomaly.k : 0;
  return rk * rk * (3 - 2 * rk);
}

/** 烈日人物之下：从大太阳方向斜洒下来的几缕淡金光柱（保留战场可读性）。 */
function drawSunAnomalyBack(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  const k = sunStrength(m);
  if (k <= .01) return;
  const cx = 600 - m.scrollX * .03;
  const reduced = reducedMotion();
  const sway = reduced ? 0 : Math.sin(g.age * .45) * .04;
  c.save();
  c.globalCompositeOperation = 'lighter';
  beam(c, cx - 70, -.22 + sway, 24, 115, '#ffd890', .07 * k);
  beam(c, cx + 10, -.06 + sway * .7, 28, 130, '#ffb868', .085 * k);
  beam(c, cx + 95, .12 + sway * .5, 20, 95, '#ff9850', .06 * k);
  c.restore();
}

/** 烈日人物之上：顶部薄暖光晕 + 缓慢上升的灼热微粒。 */
function drawSunAnomalyFront(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  const k = sunStrength(m);
  if (k <= .01) return;
  const reduced = reducedMotion();
  const lite = isLiteFx();
  const n = lite ? 9 : SUN_EMB_MAX;
  const t = g.age;
  c.save();
  c.globalCompositeOperation = 'lighter';
  // 仅覆盖顶部天光，不动中下部战场核心区域。
  const topWash = c.createLinearGradient(0, 0, 0, H * .28);
  topWash.addColorStop(0, hexA('#ffd280', .11 * k));
  topWash.addColorStop(1, hexA('#ff8840', 0));
  c.fillStyle = topWash;
  c.fillRect(-260, -260, W + 520, H * .28 + 260);
  const dt = 1 / 60;
  for (let i = 0; i < n; i++) {
    const p = sunEmbers[i];
    if (!reduced) {
      p.y -= p.v * 34 * dt;
      p.x += Math.sin(t * 1.4 + p.p) * .35;
      if (p.y < -12) { p.y = H + 12; p.x = Math.random() * W; }
    }
    const fl = reduced ? .65 : .5 + .5 * Math.sin(t * 5 + p.p);
    c.fillStyle = hexA(i % 3 === 0 ? '#fff2c2' : '#ff9f4d', (.32 + .38 * fl) * k);
    c.beginPath();
    c.arc(p.x, p.y, 1.4 * p.s, 0, TAU);
    c.fill();
  }
  c.restore();
}

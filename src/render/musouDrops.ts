import { loadImage } from '../assets/loader.ts';
import { PLAYABLE } from '../data/characters.ts';
import { FLOOR, H, W } from '../game/constants.ts';
import type { FightGame } from '../game/game.ts';
import { DROP_ARM, DROP_REACH } from '../musou/constants.ts';
import type { MusouDirector } from '../musou/director.ts';
import { evoHintFor, type CardCat, type UpgradeCard } from '../musou/upgrades.ts';
import { UI_FONT } from './fx.ts';
import type { CamView } from './musouCam.ts';

/* 音浪无双的强化卡掉落道具：
   - 世界层（drawDropsWorld）：Q 版道具图 + 柔和渐变光柱 + 头顶短名牌，画在怪的前面。
   - 界面层（drawDropsUi）：地面线下方、跟着各自道具横向锚定的说明卡，光柱一路连下来；
     角色靠近 / 悬停的那张展开详情，推荐的那张带倒数条。 */

const CAT_COL: Record<CardCat, string> = { weapon: '#76e7ff', normal: '#FDE979', skill: '#ff6fa8', stat: '#eef0fa', evo: '#E9C46A' };

/** 有专属收藏品图的角色（docs/musou-items.md）。进化卡显示主角的收藏品；没有的显示所属乐队徽章，没有乐队（或隐藏乐队）用通用徽章。 */
const COLLECTIBLES = new Set(['tomori', 'anon', 'mutsumi', 'sakiko', 'tae', 'moca', 'yukina', 'kanon', 'misaki', 'chuchu', 'ryo', 'nijika', 'nina', 'miyako', 'viola', 'hotaru', 'bocchi', 'rimi', 'sayo', 'mana']);
const BADGES = new Set(['mygo', 'ave-mujica', 'yumemita', 'poppin-party', 'pastel-palettes', 'roselia', 'hello-happy', 'sumimi', 'afterglow', 'raise-a-suilen', 'morfonica', 'millsage', 'ikka-dumb-rock', 'kessoku-band', 'togenashi-togeari']);
const evoCache = new Map<string, string>();

function evoArt(leadId: string): string {
  let path = evoCache.get(leadId);
  if (path) return path;
  if (COLLECTIBLES.has(leadId)) path = `/musou/items/c-${leadId}.png`;
  else {
    const band = (PLAYABLE.find(c => c.id === leadId)?.bands ?? []).find(b => BADGES.has(b));
    path = `/musou/items/b-${band ?? 'generic'}.png`;
  }
  evoCache.set(leadId, path);
  return path;
}

function artPath(card: UpgradeCard, leadId: string): string {
  return card.cat === 'evo' ? evoArt(leadId) : `/musou/items/${card.id.replace(':', '-')}.png`;
}

const imgs = new Map<string, HTMLImageElement | null>();
function art(path: string | null): HTMLImageElement | null {
  if (!path || typeof Image === 'undefined') return null;
  if (!imgs.has(path)) {
    imgs.set(path, null);
    loadImage(path, 1).then(im => imgs.set(path, im)).catch(() => { /* 缺图就画兜底圆片 */ });
  }
  return imgs.get(path) ?? null;
}

const rgb = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const hexA = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
const ease = (k: number) => 1 - (1 - k) ** 3;

/** 柔和渐变光柱：上窄下宽，中轴最亮、两侧淡到透明，上端也淡出。按颜色缓存一张小图，画时拉伸。 */
const beams = new Map<string, HTMLCanvasElement>();
function beamTex(col: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let cv = beams.get(col);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = 64; cv.height = 128;
  const c = cv.getContext('2d')!;
  for (let y = 0; y < 128; y++) {
    const k = y / 127;
    const half = 32 * (.18 + .82 * k);
    const g = c.createLinearGradient(32 - half, 0, 32 + half, 0);
    const a = Math.pow(k, 1.4);
    g.addColorStop(0, hexA(col, 0));
    g.addColorStop(.5, hexA(col, a));
    g.addColorStop(1, hexA(col, 0));
    c.fillStyle = g;
    c.fillRect(32 - half, y, half * 2, 1);
  }
  beams.set(col, cv);
  return cv;
}

/** 主角靠近（地上）或悬在上方（空中）的那个道具。 */
export function hoveredDrop(g: FightGame, m: MusouDirector): number {
  const lead = g.fighters[0];
  if (!lead || lead.hp <= 0) return -1;
  let best = -1, bd = DROP_REACH + 14;
  m.drops.forEach((d, i) => {
    const dx = Math.abs(d.x - lead.x);
    if (d.land >= 0 && dx < bd) { bd = dx; best = i; }
  });
  return best;
}

function itemSprite(c: CanvasRenderingContext2D, card: UpgradeCard, leadId: string, x: number, y: number, size: number): void {
  const im = art(artPath(card, leadId));
  if (im) { c.drawImage(im, x - size / 2, y - size / 2, size, size); return; }
  const col = CAT_COL[card.cat];
  c.fillStyle = hexA(col, .9);
  c.beginPath(); c.arc(x, y, size * .34, 0, Math.PI * 2); c.fill();
  c.lineWidth = 3; c.strokeStyle = 'rgba(10,12,24,.8)'; c.stroke();
  c.fillStyle = '#10131f';
  c.font = `900 ${Math.round(size * .3)}px ${UI_FONT}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(card.name.slice(0, 1), x, y + 1);
}

function pill(c: CanvasRenderingContext2D, x: number, y: number, text: string, col: string, rec: boolean): void {
  c.font = `800 11px ${UI_FONT}`;
  const label = rec ? `★ ${text}` : text;
  const tw = c.measureText(label).width;
  const pw = tw + 14, ph = 18;
  c.fillStyle = 'rgba(10,12,24,.86)';
  c.beginPath(); c.roundRect(x - pw / 2, y - ph / 2, pw, ph, 9); c.fill();
  c.lineWidth = rec ? 2 : 1.2;
  c.strokeStyle = hexA(col, rec ? 1 : .7);
  c.stroke();
  c.fillStyle = rec ? col : '#eef0fa';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, x, y + .5);
}

/* ---- 世界层 ---- */

export function drawDropsWorld(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector): void {
  if (!m.drops.length && !m.dropFx.length) return;
  const t = g.age;
  const leadId = g.fighters[0]?.data.id ?? '';
  const hov = hoveredDrop(g, m);
  c.save();
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  m.drops.forEach((d, i) => {
    const col = CAT_COL[d.card.cat];
    const rec = i === m.dropRec;
    const on = d.land >= 0 ? Math.min(1, d.land / .3) : 0;
    const armed = d.land >= DROP_ARM;
    // 光柱 + 落点光晕（叠加混合，压在怪身上也只是提亮）。
    if (on > 0) {
      const tex = beamTex(col);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = on * (rec ? .5 : .32) * (i === hov ? 1.3 : 1);
      if (tex) c.drawImage(tex, d.x - 46, FLOOR - 330, 92, 330);
      const pool = c.createRadialGradient(d.x, FLOOR, 0, d.x, FLOOR, 70);
      pool.addColorStop(0, hexA(col, .55)); pool.addColorStop(1, hexA(col, 0));
      c.fillStyle = pool;
      c.save(); c.translate(d.x, FLOOR); c.scale(1, .28); c.beginPath(); c.arc(0, 0, 70, 0, Math.PI * 2); c.restore(); c.fill();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    // 推荐：脚下一圈跟着节拍呼吸的环。
    if (rec && on > 0) {
      const p = .5 + .5 * Math.sin(t * 6);
      c.strokeStyle = hexA(col, .55 + .3 * p);
      c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(d.x, FLOOR, 44 + p * 6, 11 + p * 1.5, 0, 0, Math.PI * 2); c.stroke();
    }
    const bob = d.land >= 0 ? Math.sin(t * 3 + i * 1.7) * 4 : 0;
    const size = 62 * (i === hov ? 1.16 : 1);
    const iy = d.y - 40 + bob;
    c.globalAlpha = armed || d.land < 0 ? 1 : .8;
    itemSprite(c, d.card, leadId, d.x, iy, size);
    c.globalAlpha = 1;
    if (on > 0) pill(c, d.x, iy - size / 2 - 10, d.card.name, col, rec);
  });
  // 拿走 / 自动飞向主角 / 碎掉。
  const lead = g.fighters[0];
  for (const f of m.dropFx) {
    const k = Math.min(1, f.t / .6);
    const col = CAT_COL[f.card.cat];
    if (f.k === 'shatter') {
      c.globalAlpha = 1 - k;
      itemSprite(c, f.card, leadId, f.x, f.y - 40 + k * 20, 62 * (1 - k * .5));
    } else if (f.k === 'auto' && lead) {
      const e = ease(k);
      const x = f.x + (lead.x - f.x) * e, y = (f.y - 40) + (lead.y - 90 - (f.y - 40)) * e - Math.sin(e * Math.PI) * 60;
      c.globalAlpha = 1 - k * .7;
      itemSprite(c, f.card, leadId, x, y, 62 * (1 - e * .6));
    } else {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 1 - k;
      c.strokeStyle = col;
      c.lineWidth = 4 * (1 - k) + 1;
      c.beginPath(); c.arc(f.x, f.y - 40, 30 + ease(k) * 70, 0, Math.PI * 2); c.stroke();
      c.globalCompositeOperation = 'source-over';
      itemSprite(c, f.card, leadId, f.x, f.y - 40 - ease(k) * 40, 62 * (1 + k * .4));
    }
    c.globalAlpha = 1;
  }
  c.restore();
}

/* ---- 界面层：地面线下方的说明卡 ---- */

function fit(c: CanvasRenderingContext2D, text: string, max: number): string {
  if (c.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

export function drawDropsUi(c: CanvasRenderingContext2D, g: FightGame, m: MusouDirector, cam: CamView, w: number, h: number): void {
  if (!m.drops.length) return;
  const landed = m.drops.every(d => d.land >= 0);
  if (!landed) return;
  const fade = Math.min(1, Math.min(...m.drops.map(d => d.land)) / .2);
  const kx = w / W, ky = h / H;
  const sx = (wx: number) => ((wx - cam.fx) * cam.z + W / 2 + cam.ox) * kx;
  const sy = (wy: number) => ((wy - cam.fy) * cam.z + cam.fy + cam.oy) * ky;
  const touch = typeof document !== 'undefined' && document.body.classList.contains('touch');
  const leadId = g.fighters[0]?.data.id ?? '';
  const hov = hoveredDrop(g, m);
  const floorY = sy(FLOOR);
  const CW = 150, EW = 196, CH = 34, EH = 64, GAP = 6;
  // 手机左右下角是摇杆和按键：卡片只在中间那段里排。
  const lo = touch ? w * .24 : 8, hi = touch ? w * .76 : w - 8;
  const cards = m.drops.map((d, i) => {
    const big = i === hov;
    const cw = big ? EW : CW;
    return { d, i, big, cw, ch: big ? EH : CH, ax: sx(d.x), x: 0 };
  });
  for (const k of cards) k.x = Math.min(Math.max(k.ax, lo + k.cw / 2), hi - k.cw / 2);
  // 排开：按锚点从左到右，互相不压。
  const order = [...cards].sort((a, b) => a.ax - b.ax);
  for (let pass = 0; pass < 4; pass++) {
    for (let j = 1; j < order.length; j++) {
      const a = order[j - 1], b = order[j];
      const need = a.cw / 2 + b.cw / 2 + GAP - (b.x - a.x);
      if (need > 0) { a.x -= need / 2; b.x += need / 2; }
    }
    for (const k of order) k.x = Math.min(Math.max(k.x, lo + k.cw / 2), hi - k.cw / 2);
  }
  const top = Math.min(floorY + 10, h - EH - 6);
  c.save();
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  c.shadowBlur = 0;
  c.globalAlpha = fade;
  for (const k of order) {
    const { d, i, big, cw, ch } = k;
    const col = CAT_COL[d.card.cat];
    const rec = i === m.dropRec;
    const dim = hov >= 0 && !big ? .6 : 1;
    // 光柱从地面一路连到卡片。
    const lg = c.createLinearGradient(0, floorY, 0, top);
    lg.addColorStop(0, hexA(col, .5 * dim)); lg.addColorStop(1, hexA(col, .15 * dim));
    c.strokeStyle = lg; c.lineWidth = 2;
    c.beginPath(); c.moveTo(Math.min(Math.max(k.ax, 0), w), floorY); c.lineTo(k.x, top); c.stroke();
    const x0 = k.x - cw / 2;
    // 底板不透明（不让地面光效透上来），没被选中的只把内容压暗。
    c.globalAlpha = fade;
    c.fillStyle = '#0e1221';
    c.beginPath(); c.roundRect(x0, top, cw, ch, 8); c.fill();
    c.lineWidth = rec ? 2 : 1;
    c.strokeStyle = rec ? col : 'rgba(255,255,255,.12)';
    c.stroke();
    c.globalAlpha = fade * dim;
    // 左侧色条 + 小图。
    const stub = big ? 40 : 30;
    c.fillStyle = hexA(col, .95);
    c.beginPath(); c.roundRect(x0, top, stub, ch, [8, 0, 0, 8]); c.fill();
    itemSprite(c, d.card, leadId, x0 + stub / 2, top + Math.min(ch, 34) / 2 + (big ? 6 : 0), big ? 34 : 26);
    const tx = x0 + stub + 8, tw = cw - stub - 14;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff';
    c.font = `900 ${big ? 14 : 12}px ${UI_FONT}`;
    const tag = d.card.cat === 'evo' ? 'EVOLVE' : d.card.lv === 1 ? 'NEW' : `LV${d.card.lv}`;
    c.fillText(fit(c, d.card.name, tw - 40), tx, top + (big ? 19 : 15));
    c.font = `800 9px ${UI_FONT}`;
    c.textAlign = 'right';
    c.fillStyle = rec ? col : 'rgba(238,240,250,.55)';
    c.fillText(rec ? `推荐 · ${tag}` : tag, x0 + cw - 7, top + (big ? 18 : 14));
    c.textAlign = 'left';
    c.font = `700 ${big ? 11 : 10}px ${UI_FONT}`;
    c.fillStyle = d.card.cat === 'stat' ? '#eef0fa' : col;
    c.fillText(fit(c, d.card.line, tw), tx, top + (big ? 37 : 28));
    if (big) {
      const hint = evoHintFor(m.build, d.card.id);
      c.font = `700 10px ${UI_FONT}`;
      c.fillStyle = hint && hint.partnerHave > 0 ? '#E9C46A' : 'rgba(238,240,250,.55)';
      const sub = hint ? `配 ${hint.partnerName} → ${hint.evoName}` : touch ? '跳起下砸拾取' : '二段跳后下砸拾取';
      c.fillText(fit(c, sub, tw), tx, top + 53);
    }
    // 推荐卡的倒数：走完自动拿它。
    if (rec) {
      const left = Math.max(0, 1 - m.dropT / m.dropMax);
      c.fillStyle = hexA(col, .9);
      c.fillRect(x0 + stub, top + ch - 3, (cw - stub) * left, 3);
    }
    c.globalAlpha = fade;
  }
  // 后面还排着几组。
  const more = m.upgradeOffers - 1;
  if (more > 0) {
    const r = cards[m.dropRec] ?? cards[0];
    c.font = `800 10px ${UI_FONT}`;
    c.textAlign = 'center';
    c.fillStyle = '#FDE979';
    c.fillText(`还有 ${more} 组`, r.x, top - 6);
  }
  c.restore();
}

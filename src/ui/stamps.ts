/* 印章册：战胜哪个人机角色，就获得哪个角色的印章；记录击败该角色的最高难度。
   只存在本机浏览器的 localStorage，读写都包 try/catch，无痕模式下静默不记。
   结算海报的「首次 · 大师」飘带、选人卡底边色条、印章册页面都从这里取数。 */

import { BANDS, groupOf, groupOrder } from '../data/bands.ts';
import { PLAYABLE_BY_ID, PUBLIC_ROSTER } from '../data/characters.ts';
import type { CharacterData } from '../data/types.ts';
import type { FightGame } from '../game/game.ts';
import { humanTeam, type MatchReport } from '../game/report.ts';
import { assignFirst, loadImage } from '../assets/loader.ts';

// v1 记的是玩家使用的角色，无法还原对手；保留原数据，不混入击败记录。
const KEY = 'mf.stamps.v2';
const STRIP_KEY = 'mf.stampStrip';
const STAMP_IDS = new Set(PUBLIC_ROSTER.map(c => c.id));
export const STAMP_NAMES = ['轻松', '标准', '大师'] as const;

export interface Stamp { d: number; rank?: string }
type Book = Record<string, Stamp>;

let cache: Book | null = null;
let cachedRaw: string | null = null;

export function readStamps(): Book {
  let book: Book = {};
  try {
    const stored = localStorage.getItem(KEY);
    if (cache && stored === cachedRaw) return cache;
    const raw = JSON.parse(stored ?? '{}') as unknown;
    if (raw && typeof raw === 'object') {
      for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!PLAYABLE_BY_ID.has(id)) continue;
        const d = (v as Stamp | null)?.d;
        if (Number.isInteger(d) && d! >= 0 && d! <= 2) book[id] = { d: d!, rank: typeof (v as Stamp).rank === 'string' ? (v as Stamp).rank : undefined };
      }
    }
    cachedRaw = stored;
  } catch { return cache ?? {}; }
  cache = book;
  return book;
}

/** 击败该角色的最高人机难度，没有为 -1。 */
export function stampOf(id: string): number {
  return STAMP_IDS.has(id) ? (readStamps()[id]?.d ?? -1) : -1;
}

/** 记录被击败的角色。返回这次是否刷新了击败该角色的最高难度。 */
export function recordClear(id: string, d: number, rank: string): boolean {
  if (!STAMP_IDS.has(id)) return false;
  const book = readStamps();
  const prev = book[id];
  const first = !prev || d > prev.d;
  if (first) book[id] = { d, rank };
  else if (prev.d === d && rankBetter(rank, prev.rank)) prev.rank = rank;
  else return false;
  cache = book;
  try {
    const raw = JSON.stringify(book);
    localStorage.setItem(KEY, raw);
    cachedRaw = raw;
  } catch { /* 无痕模式：这局照常结算，只是不记 */ }
  return first;
}

/** 本地 1V1 / 2V2 整场获胜，为败方正式角色盖章，同角色只记一次。 */
export function recordMatchClear(g: FightGame, report: MatchReport): boolean {
  if ((g.mode !== 'cpu' && g.mode !== 'team') || g.netRole || g.phase !== 'finished'
    || g.winnerTeam < 0 || humanTeam(g) !== g.winnerTeam || report.win !== true
    || typeof report.seal !== 'number' || report.seal !== g.difficulty
    || !Number.isInteger(report.seal) || report.seal < 0 || report.seal > 2) return false;
  const foes = new Set(g.fighters.filter(f => f.team !== g.winnerTeam && !f.minion && !f.echo).map(f => f.data.id));
  let first = false;
  for (const id of foes) if (recordClear(id, report.seal, report.rank)) first = true;
  if (first) report.tag = `首次 · ${STAMP_NAMES[report.seal]}`;
  return first;
}

function rankBetter(a: string, b: string | undefined): boolean {
  const order = 'SABC';
  return !b || order.indexOf(a) >= 0 && order.indexOf(a) < order.indexOf(b);
}

export function stripOn(): boolean {
  try { return localStorage.getItem(STRIP_KEY) !== 'off'; } catch { return true; }
}

export function setStripOn(on: boolean): void {
  try { localStorage.setItem(STRIP_KEY, on ? 'on' : 'off'); } catch { /* 无痕模式 */ }
  document.body.classList.toggle('no-seal-strip', !on);
}

/** 小号印章：锯齿外缘 + 一圈细线 + 星级。尺寸太小不放环形字。 */
export function miniSeal(d: number): string {
  const c = 40, pts: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * i / 20, r = i % 2 ? 34 : 38;
    pts.push((c + r * Math.cos(a)).toFixed(1) + ',' + (c + r * Math.sin(a)).toFixed(1));
  }
  const n = d + 1;
  const stars = Array.from({ length: n }, (_, i) => `<text x="${c + (i - (n - 1) / 2) * 15}" y="${c + 6}" text-anchor="middle">★</text>`).join('');
  return `<svg class="mini-seal" data-d="${d}" viewBox="0 0 80 80" aria-hidden="true"><polygon points="${pts.join(' ')}"/><circle cx="${c}" cy="${c}" r="27"/>${stars}</svg>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

const LAYOUT_KEY = 'mf.stampLayout';
export type StampLayout = 'flat' | 'band';
export function stampLayout(): StampLayout {
  try { return localStorage.getItem(LAYOUT_KEY) === 'band' ? 'band' : 'flat'; } catch { return 'flat'; }
}
export function setStampLayout(v: StampLayout): void {
  try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* 无痕模式 */ }
}

/** 名册按乐队顺序排好；直接排开和分组都用这个顺序，两种排法里角色位置一致。 */
function groups(): { key: string; name: string; color?: string; members: CharacterData[] }[] {
  const map = new Map<string, CharacterData[]>();
  for (const c of PUBLIC_ROSTER) {
    const key = groupOf(c);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return groupOrder().filter(k => map.has(k)).map(k => {
    const band = BANDS.find(b => b.id === k);
    return { key: k, name: band?.name ?? '无所属', color: band?.color, members: map.get(k)! };
  });
}

function counts(book: Book): [number, number, number] {
  const n = (d: number) => PUBLIC_ROSTER.filter(c => (book[c.id]?.d ?? -1) >= d).length;
  return [n(2), n(1), n(0)];
}

/** 印章册页面内容：总进度 + 方形头像墙，右上角盖最高难度的章；没拿到的头像压暗，不画空位。 */
export function renderStampBook(host: HTMLElement, layout: StampLayout = stampLayout()): void {
  const book = readStamps();
  const [gold, pink, any] = counts(book);
  const cell = (c: CharacterData) => {
    const s = book[c.id];
    return `<figure class="sb-cell${s ? '' : ' is-empty'}">
        <span class="sb-face"><img alt="" data-id="${esc(c.id)}" width="96" height="96" decoding="async"></span>
        ${s ? miniSeal(s.d) : ''}
        <figcaption>${esc(c.name)}${s ? `<small>${STAMP_NAMES[s.d]}${s.rank ? ' · ' + esc(s.rank) : ''}</small>` : ''}</figcaption>
      </figure>`;
  };
  let html = `<div class="sb-total">
      <span class="sb-count" data-d="2"><b>${gold}</b> / ${PUBLIC_ROSTER.length}<em>金章</em></span>
      <span class="sb-count" data-d="1"><b>${pink}</b><em>粉章及以上</em></span>
      <span class="sb-count" data-d="0"><b>${any}</b><em>已盖章</em></span>
    </div>`;
  const all = groups();
  if (layout === 'flat') {
    html += `<div class="sb-grid is-flat">${all.flatMap(g => g.members).map(cell).join('')}</div>`;
  } else {
    for (const g of all) {
      const got = g.members.filter(c => book[c.id]).length;
      html += `<div class="sb-band"${g.color ? ` style="--band:${g.color}"` : ''}><i aria-hidden="true"></i><b>${esc(g.name)}</b><span>${got} / ${g.members.length}</span></div><div class="sb-grid">${g.members.map(cell).join('')}</div>`;
    }
  }
  host.innerHTML = html;
  for (const img of host.querySelectorAll<HTMLImageElement>('img[data-id]')) {
    assignFirst(img, [`/avatars/${img.dataset.id}.png`, '/avatars/placeholder.png']);
  }
}

/* ---------- 一览海报：整面印章墙画进一张图，保存或长按保存 ---------- */

const INK = { bg: '#0b0e1a', panel: '#121729', line: '#29324f', text: '#eef0fa', muted: '#97a1c3', brand: '#ff3b7f', gold: '#E9C46A', dark: '#14140c' };
const SEAL_FILL = [INK.muted, INK.brand, INK.gold];
const SEAL_INK = [INK.bg, '#ffffff', INK.dark];
const MONO = '"MF Mono", ui-monospace, monospace';
const HEAD = '"MF Poster", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

function face(id: string): Promise<HTMLImageElement | null> {
  return loadImage(`/avatars/${id}.png`).catch(() => loadImage('/avatars/placeholder.png')).catch(() => null);
}

function roundRect(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r);
  x.closePath();
}

function drawSeal(x: CanvasRenderingContext2D, cx: number, cy: number, size: number, d: number): void {
  const k = size / 80;
  x.save();
  x.translate(cx, cy);
  x.rotate(-12 * Math.PI / 180);
  x.scale(k, k);
  x.beginPath();
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * i / 20, r = i % 2 ? 34 : 38;
    const px = r * Math.cos(a), py = r * Math.sin(a);
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
  x.lineWidth = 6; x.strokeStyle = INK.panel; x.stroke();
  x.fillStyle = SEAL_FILL[d]; x.fill();
  x.beginPath(); x.arc(0, 0, 27, 0, Math.PI * 2);
  x.globalAlpha = .55; x.lineWidth = 1.5; x.strokeStyle = SEAL_INK[d]; x.stroke(); x.globalAlpha = 1;
  x.fillStyle = SEAL_INK[d]; x.font = `900 14px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = d + 1;
  for (let i = 0; i < n; i++) x.fillText('★', (i - (n - 1) / 2) * 15, 1);
  x.restore();
}

/** 整面印章墙（直接排开）画成一张 1080 宽的海报。 */
export async function stampPoster(player: string): Promise<HTMLCanvasElement | null> {
  const book = readStamps();
  const roster = groups().flatMap(g => g.members);
  try { await document.fonts?.load(`900 20px "MF Poster"`, '印章册' + player + roster.map(c => c.name).join('')); } catch { /* 没有 FontFaceSet 就用回落字 */ }
  const faces = await Promise.all(roster.map(c => face(c.id)));
  const W = 1080, PAD = 64, COLS = 8, GAP = 18;
  const cw = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
  const rowH = cw + 46;
  const rows = Math.ceil(roster.length / COLS);
  const top = 300;
  const H = top + rows * rowH + 120;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  if (!x) return null;
  x.fillStyle = INK.bg; x.fillRect(0, 0, W, H);
  // 两块几何：品牌粉斜条 + 一块浅色票面
  x.fillStyle = INK.panel; roundRect(x, 24, 24, W - 48, H - 48, 28); x.fill();
  x.fillStyle = INK.brand; x.beginPath(); x.moveTo(W - 400, 24); x.lineTo(W - 352, 24); x.lineTo(W - 392, 150); x.lineTo(W - 440, 150); x.closePath(); x.fill();
  const [gold, pink, any] = counts(book);
  x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  x.fillStyle = INK.brand; roundRect(x, PAD, 70, 96, 30, 6); x.fill();
  x.fillStyle = '#ffffff'; x.font = `800 17px ${MONO}`; x.fillText('STAMP', PAD + 16, 91);
  x.fillStyle = INK.text; x.font = `800 22px ${MONO}`; x.fillText('MOEFIGHTERS', PAD + 112, 92);
  x.font = `900 64px ${HEAD}`; x.fillText('印章册', PAD, 178);
  const now = new Date();
  // 右上角：玩家（联机代号）+ 日期
  x.textAlign = 'right';
  x.fillStyle = INK.muted; x.font = `800 14px ${MONO}`; x.fillText('PLAYER', W - PAD, 84);
  x.fillStyle = INK.text; x.font = `900 30px ${HEAD}`; x.fillText(player, W - PAD, 124, 280);
  x.fillStyle = INK.muted; x.font = `500 20px ${MONO}`;
  x.fillText(`${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`, W - PAD, 156);
  // 进度：金章最大，其余两项跟在后面
  x.textAlign = 'left';
  let cx = PAD;
  const stat = (n: string, tail: string, label: string, color: string, size: number) => {
    x.fillStyle = color; x.font = `900 ${size}px ${MONO}`; x.fillText(n, cx, 252); cx += x.measureText(n).width + 6;
    if (tail) { x.fillStyle = INK.muted; x.font = `700 26px ${MONO}`; x.fillText(tail, cx, 252); cx += x.measureText(tail).width + 10; }
    x.fillStyle = INK.muted; x.font = `700 18px ${HEAD}`; x.fillText(label, cx, 252); cx += x.measureText(label).width + 40;
  };
  stat(String(gold), `/ ${roster.length}`, '金章', INK.gold, 56);
  stat(String(pink), '', '粉章及以上', INK.brand, 36);
  stat(String(any), '', '已盖章', INK.text, 36);
  x.fillStyle = INK.line; x.fillRect(PAD, 276, W - PAD * 2, 1);
  // 头像墙
  roster.forEach((c, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const l = PAD + col * (cw + GAP), t = top + 18 + row * rowH;
    const s = book[c.id];
    x.save();
    roundRect(x, l, t, cw, cw, 14); x.clip();
    x.fillStyle = INK.line; x.fillRect(l, t, cw, cw);
    const im = faces[i];
    if (im) { x.globalAlpha = s ? 1 : .32; x.drawImage(im, l, t, cw, cw); x.globalAlpha = 1; }
    x.restore();
    if (s) drawSeal(x, l + cw - 10, t + 8, cw * .48, s.d);
    x.fillStyle = s ? INK.text : INK.muted; x.font = `900 17px ${HEAD}`; x.textAlign = 'center';
    x.fillText(c.name, l + cw / 2, t + cw + 28, cw + GAP);
  });
  x.textAlign = 'left'; x.fillStyle = INK.muted; x.font = `700 18px ${MONO}`;
  x.fillText('moefighters.com', PAD, H - 64);
  x.textAlign = 'right'; x.font = `700 16px ${HEAD}`;
  x.fillText('1V1 / 2V2 · 记录击败各角色的最高难度', W - PAD, H - 64);
  return cv;
}

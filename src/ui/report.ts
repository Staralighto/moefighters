/* 结算海报（LIVE REPORT）。数据由 game/report.ts 给出，这里只负责画。
   性能：头像和海报字在开局时就预载、解码（preloadReport），结算时只拼一次 innerHTML，
   动效全部是 transform / opacity，数字滚动只跑半秒 rAF。 */

import { ROSTER_BY_ID } from '../data/characters.ts';
import type { CharacterData } from '../data/types.ts';
import type { MatchReport, ReportFighter } from '../game/report.ts';
import { assignFirst, loadImage } from '../assets/loader.ts';

const W = 960;
const H = 540;
const DIFF = ['轻松', '标准', '大师'];
const DIFF_EN = ['EASY', 'NORMAL', 'MASTER'];
/** 结算页的固定汉字，开局时让海报字先把这些字形下好。 */
const GLYPHS = '首次观你赢了输获胜人机轻松标准大师对战联机绝境安可无伤新纪录终演剩余终结技被于巡演第站止步最远高连击造成伤害必杀';

const avatarSrc = new Map<string, string>();

/** 开局时调用：头像下载并解码，海报字预取结算用字。结算时直接上图，不等网络。 */
export function preloadReport(chars: readonly CharacterData[]): void {
  for (const c of chars) {
    if (avatarSrc.has(c.id)) continue;
    const logical = `/avatars/${c.id}.png`;
    void loadImage(logical)
      .catch(() => loadImage('/avatars/placeholder.png'))
      .then(im => { avatarSrc.set(c.id, im.src); return im.decode?.(); })
      .catch(() => {});
  }
  try { void document.fonts?.load(`900 20px "MF Poster"`, GLYPHS).catch(() => {}); } catch { /* 老内核没有 FontFaceSet */ }
}

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const charOf = (id: string): CharacterData | undefined => ROSTER_BY_ID.get(id);

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.codePointAt(0)!; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function ticketCode(r: MatchReport, date: string): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let h = hash(JSON.stringify(r) + date), out = '';
  for (let i = 0; i < 8; i++) { out += A[h % A.length]; h = Math.floor(h / A.length) || hash(out + i); }
  return `MF-${out.slice(0, 4)}-${out.slice(4)}`;
}

/** 角色色上写字用黑还是白：亮色块（黄、浅青、浅粉）换深色字。 */
function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return '#ffffff';
  const ch = (v: number) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  const L = .2126 * ch(n >> 16) + .7152 * ch((n >> 8) & 255) + .0722 * ch(n & 255);
  return L > .45 ? '#0b0e1a' : '#ffffff';
}

function sealSVG(seal: MatchReport['seal'], win: boolean | null): string {
  const c = 80;
  const pts: string[] = [];
  for (let i = 0; i < 64; i++) {
    const a = Math.PI * i / 32, r = i % 2 ? 70 : 76;
    pts.push((c + r * Math.cos(a)).toFixed(1) + ',' + (c + r * Math.sin(a)).toFixed(1));
  }
  const burst = pts.join(' ');
  const cpu = typeof seal === 'number';
  const ring = cpu ? `★ MOEFIGHTERS ★ 人机对战 ★ ${DIFF_EN[seal]} ${win === false ? 'CHALLENGE' : 'CLEAR'} `
    : seal === 'online' ? '★ MOEFIGHTERS ★ 联机对战 ★ ONLINE MATCH ★ LIVE '
    : seal === 'watch' ? '★ MOEFIGHTERS ★ 人机观战 ★ SPECTATE ★ LIVE '
    : '★ MOEFIGHTERS ★ 玩家对战 ★ VERSUS MATCH ★ LIVE ';
  const big = cpu ? DIFF[seal] : seal === 'online' ? '联机' : seal === 'watch' ? '观战' : '对战';
  const stars = cpu ? `<text class="rp-stars" x="${c + 1.5}" y="${c + 29}" text-anchor="middle">${'★'.repeat(seal + 1)}</text>` : '';
  return `<svg viewBox="0 0 160 160" aria-hidden="true">
    <defs><path id="rp-seal-arc" d="M${c},${c} m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0"/></defs>
    <polygon class="rp-burst-shadow" points="${burst}" transform="translate(6 7)"/>
    <polygon class="rp-burst" points="${burst}"/>
    <circle class="rp-ring" cx="${c}" cy="${c}" r="63" stroke-width="2"/>
    <circle class="rp-ring" cx="${c}" cy="${c}" r="42" stroke-width="1" opacity=".55"/>
    <text class="rp-arc"><textPath href="#rp-seal-arc" xlink:href="#rp-seal-arc" textLength="322" lengthAdjust="spacing">${ring}</textPath></text>
    <text class="rp-big" x="${c}" y="${c + (cpu ? 9 : 12)}" text-anchor="middle">${big}</text>
    ${stars}
  </svg>`;
}

function sideHTML(list: readonly ReportFighter[], lead: boolean, hp: number, tag: string): string {
  const avs = list.map(f => `<span class="rp-av"><img alt="" data-id="${esc(f.id)}" width="196" height="196" decoding="async"></span>`).join('');
  const names = list.map(f => esc(charOf(f.id)?.name ?? f.id)).join(' · ');
  const ribbon = tag ? `<span class="rp-ribbon${tag === '无伤' ? ' is-cool' : ''}">${esc(tag)}</span>` : '';
  const mark = lead ? '' : '<span class="rp-endmark">终演</span>';
  const d = lead ? 160 : 260;
  return `<div class="rp-side ${lead ? 'is-lead' : 'is-down'}${list.length > 1 ? ' is-duo' : ''}">
      <div class="rp-avs rp-a" style="--d:${d}">${avs}${ribbon}${mark}</div>
      <div class="rp-name rp-a" style="--d:${d + 100}">${names}</div>
      <div class="rp-hp rp-a" style="--d:${d + 160}"><span>HP</span><div class="rp-track"><i style="width:${hp}%"></i></div></div>
      <div class="rp-hpnum rp-a" style="--d:${d + 200}"><b data-n="${hp}">${hp}</b><span class="rp-pct">%</span>${lead ? '<em>剩余</em>' : ''}</div>
    </div>`;
}

let countRaf = 0;
let fitObs: ResizeObserver | null = null;

/** 把海报按 960×540 设计稿等比缩放进结算层（按钮在下面留一行）。 */
function fit(host: HTMLElement, card: HTMLElement): void {
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  const k = Math.min(w / W, h / H);
  card.style.transform = `translate(-50%, -50%) scale(${k})`;
}

export function showReport(host: HTMLElement, r: MatchReport): void {
  const lead = r.winners;
  const down = r.losers;
  const leadChar = charOf(lead[0]?.id ?? '');
  const color = leadChar?.color ?? '#ff3b7f';
  const tour = r.tour;
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
  const tag = tour?.newBest && r.win !== false ? '新纪录' : r.tag;
  const firstClear = tag.startsWith('首次 · ');
  const winNames = lead.map(f => charOf(f.id)?.name ?? f.id).join(' & ');

  const title = tour ? (r.win === false ? 'TOUR<br>OVER' : `STAGE ${tour.stage}<br>CLEAR`)
    : r.win === false ? 'LIVE<br>OVER' : 'LIVE<br>CLEAR';
  const line = tour
    ? (r.win === false ? `止步第 <b>${tour.stage}</b> 站 · 最远 <b>${tour.best}</b> 站` : `巡演 第 <b>${tour.stage}</b> 站`)
    : r.win === true ? '<b>你赢了</b>' : r.win === false ? '你输了' : `<b>${esc(winNames)}</b> 获胜`;
  const fin = r.fin ? `<div class="rp-fin">${r.win === false ? '被终结于' : '终结技'}<b>${esc(r.fin)}</b></div>` : '';
  const score = tour ? 'VS' : `${r.score[0]}<span> : </span>${r.score[1]}`;
  const quote = leadChar?.quote ?? '';

  const card = document.createElement('div');
  card.className = 'rp' + (r.win === false ? ' is-lose' : '') + (tour ? ' is-tour' : '');
  card.style.setProperty('--win', color);
  card.style.setProperty('--on-win', onColor(color));
  card.innerHTML = `
    <div class="rp-slab"></div><div class="rp-pin"></div>
    <div class="rp-head rp-a" style="--d:0">
      <span class="rp-live">${tour ? 'TOUR' : 'LIVE'}</span>
      <span class="rp-title">MOEFIGHTERS <span>／ ${esc(r.stage)}</span></span>
      <span class="rp-date">${date}</span>
    </div>
    <section class="rp-main">
      <div class="rp-match">
        ${sideHTML(lead, true, r.winHp, firstClear ? '' : tag)}
        <div class="rp-foecol"><div class="rp-score rp-a" style="--d:360">${score}</div>${sideHTML(down, false, r.loseHp, firstClear ? tag : '')}</div>
      </div>
      <div class="rp-board">
        <div class="rp-verdict rp-a" style="--d:460"><h2>${title}</h2><p>${line}</p>${fin}</div>
        <div class="rp-stats rp-a" style="--d:600">
          <div class="rp-rank"><span>LIVE RANK</span>${r.rank}</div>
          <div class="rp-stat"><span>最高连击</span><b data-n="${r.combo}">0</b></div>
          <div class="rp-stat"><span>造成伤害</span><b data-n="${r.dmg}">0</b></div>
          <div class="rp-stat"><span>必杀</span><b data-n="${r.ult}">0</b></div>
        </div>
        <div class="rp-seal" data-seal="${r.seal}">${sealSVG(r.seal, r.win)}</div>
      </div>
    </section>
    <div class="rp-foot rp-a" style="--d:720">
      <span class="rp-qbar"></span>
      ${quote ? `<span class="rp-quote">${esc(quote)}</span><span class="rp-by">—— ${esc(leadChar?.name ?? '')}</span>` : ''}
      <span class="rp-stub"><b>${ticketCode(r, date)}</b><br>moefighters.com</span>
    </div>`;

  for (const img of card.querySelectorAll<HTMLImageElement>('img[data-id]')) {
    const id = img.dataset.id!;
    const ready = avatarSrc.get(id);
    if (ready) img.src = ready;
    else assignFirst(img, [`/avatars/${id}.png`, '/avatars/placeholder.png']);
  }

  host.replaceChildren(card);
  host.hidden = false;
  fit(host, card);
  fitObs?.disconnect();
  if (typeof ResizeObserver === 'function') {
    fitObs = new ResizeObserver(() => fit(host, card));
    fitObs.observe(host);
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nums = [...card.querySelectorAll<HTMLElement>('[data-n]')];
  const fmt = (v: number) => v.toLocaleString('en-US');
  cancelAnimationFrame(countRaf);
  if (reduce) { for (const b of nums) b.textContent = fmt(Number(b.dataset.n)); return; }
  card.classList.add('is-play');
  if (r.seal === 2 && r.win !== false) card.classList.add('is-thud');
  // 血量数字一出场就是终值（它和血条一起滑入）；三项数据从 0 滚到终值。
  for (const b of nums) if (!b.closest('.rp-stat')) b.textContent = fmt(Number(b.dataset.n));
  const rolling = nums.filter(b => b.closest('.rp-stat'));
  const t0 = performance.now() + 650, dur = 480;
  const tick = (t: number) => {
    const k = Math.max(0, Math.min(1, (t - t0) / dur)), e = 1 - (1 - k) ** 3;
    for (const b of rolling) b.textContent = fmt(Math.round(Number(b.dataset.n) * e));
    if (k < 1) countRaf = requestAnimationFrame(tick);
  };
  countRaf = requestAnimationFrame(tick);
}

export function hideReport(host: HTMLElement): void {
  cancelAnimationFrame(countRaf);
  fitObs?.disconnect();
  fitObs = null;
  host.hidden = true;
  host.replaceChildren();
}

/* 任务 = 专辑墙。每个乐队一张方形美术封面，封面下是完成数和细进度条。
   没全清的封面罩着一层塑封膜，贴一枚进度贴纸；领完全清奖励后，第一次回到墙上时塑封膜沿对角撕开，
   封面变亮面并盖上 CLEAR 章。最后一张「精选集」是通用成就。
   点封面打开「专辑背面」：曲目表式的任务列表，可单条领取，也可一键领取本专辑全部；墙顶上有全部领取。 */

import { ALBUMS, tasksOf, type AlbumDef } from '../tasks/defs.ts';
import { assetUrl } from '../assets/loader.ts';
import { albumBonusId, albumCleared, albumDone, claim, claimable, isClaimed, isDone, onTasks, progressOf, refreshPassive, totals } from '../tasks/progress.ts';
import { registerHubPage } from './hub.ts';
import { frameHTML, itemName } from './items.ts';
import { showReward } from './reward.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHARD = '<svg class="tk-shard" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-shard"/></svg>';
const TORN_KEY = 'mf.albums.torn';

let root: HTMLElement | null = null;
let openAlbum: AlbumDef | null = null;
let openDialog: (d: HTMLDialogElement) => void = d => d.showModal();

function torn(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(TORN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function markTorn(id: string): void {
  const s = torn(); s.add(id);
  try { localStorage.setItem(TORN_KEY, JSON.stringify([...s])); } catch { /* 下次再撕一次也无妨 */ }
}

function counts(a: AlbumDef): { done: number; all: number; ready: number } {
  const ts = tasksOf(a.id);
  return { done: ts.filter(isDone).length, all: ts.length, ready: claimable(a.id).length };
}

/** 墙面和弹窗共用同一张 384px 封面。 */
function coverHTML(a: AlbumDef): string {
  return `<img class="al-cover" src="${esc(assetUrl(`/albums/${a.id}.webp`))}" alt="" width="384" height="384" loading="lazy" decoding="async">`;
}

/* 一次重画只读一遍「已撕塑封」记录。 */
let tornNow: Set<string> = new Set();

function tileHTML(a: AlbumDef, i: number): string {
  const c = counts(a);
  const cleared = albumCleared(a.id);
  const tear = cleared && !tornNow.has(a.id);
  const state = cleared ? (tear ? 'tearing' : 'clear') : 'sealed';
  return `<li style="--n:${i}"><button type="button" class="al-tile" data-album="${esc(a.id)}" data-state="${state}" aria-label="${esc(a.name)}，完成 ${c.done} / ${c.all}${c.ready ? `，${c.ready} 项可领取` : ''}">`
    + `<span class="al-art" data-scheme="dark">${coverHTML(a)}`
    + '<span class="al-wrap" aria-hidden="true"><i></i><i></i></span>'
    + `<span class="al-sticker" aria-hidden="true">${c.done}<small>/${c.all}</small></span>`
    + '<span class="al-clear" aria-hidden="true">CLEAR</span>'
    + (c.ready ? `<span class="al-ready">可领取 ${c.ready}</span>` : '')
    + '</span>'
    + `<span class="al-meta"><b>${esc(a.name)}</b><small>${c.done} / ${c.all}</small></span>`
    + `<span class="al-bar" style="--k:${c.all ? c.done / c.all : 0}"><i></i></span>`
    + '</button></li>';
}

function paintWall(): void {
  if (!root) return;
  const t = totals();
  root.querySelector('.tk-sum-n')!.innerHTML = `${t.done}<small> / ${t.all}</small>`;
  (root.querySelector('.tk-sum-bar') as HTMLElement).style.setProperty('--k', String(t.all ? t.done / t.all : 0));
  const all = root.querySelector<HTMLButtonElement>('.tk-claim-all')!;
  all.disabled = !t.ready;
  all.querySelector('span')!.textContent = t.ready ? `全部领取 · ${t.ready}` : '暂无可领取';
  /* 只换内容变了的那几格，li 本身保留：整墙重建会让进场动画（挂在 li 上）每次关弹窗都重播一遍。 */
  const wall = root.querySelector<HTMLElement>('.tk-wall')!;
  tornNow = torn();
  if (wall.children.length !== ALBUMS.length) wall.innerHTML = ALBUMS.map((a, i) => `<li style="--n:${i}"></li>`).join('');
  ALBUMS.forEach((a, i) => {
    const li = wall.children[i] as HTMLElement;
    const html = tileHTML(a, i);
    if (li.dataset.sig === html) return;
    li.dataset.sig = html;
    li.innerHTML = html.replace(/^<li[^>]*>/, '').replace(/<\/li>$/, '');
  });
  sizeWall();
  for (const b of root.querySelectorAll<HTMLButtonElement>('.al-tile')) {
    b.onclick = () => showAlbum(ALBUMS.find(a => a.id === b.dataset.album)!);
  }
  /* 撕塑封：动画放完才记下，下次进来就是亮面。 */
  for (const b of root.querySelectorAll<HTMLElement>('.al-tile[data-state="tearing"]')) {
    const id = b.dataset.album!;
    if (reduced()) { markTorn(id); b.dataset.state = 'clear'; continue; }
    setTimeout(() => { b.classList.add('tear'); setTimeout(() => { markTorn(id); b.dataset.state = 'clear'; b.classList.remove('tear'); }, 900); }, 500 + Math.random() * 200);
  }
}

/* 进度贴纸按封面宽度缩放（--u = 宽 / 100），墙上的格宽随窗口变，量出来写给 --cw。 */
let sizer: ResizeObserver | null = null;
function sizeWall(): void {
  const wall = root?.querySelector<HTMLElement>('.tk-wall');
  if (!wall) return;
  const measure = () => {
    const art = wall.querySelector<HTMLElement>('.al-art');
    if (art?.offsetWidth) wall.style.setProperty('--cw', art.offsetWidth + 'px');
  };
  measure();
  if (!sizer && typeof ResizeObserver !== 'undefined') { sizer = new ResizeObserver(measure); sizer.observe(wall); }
}

function rowHTML(a: AlbumDef, i: number): string {
  const t = tasksOf(a.id)[i];
  const p = progressOf(t), done = isDone(t), got = isClaimed(t.id);
  const state = got ? 'got' : done ? 'ready' : 'todo';
  const action = got ? '<span class="tk-got" aria-label="已领取">✓</span>'
    : done ? `<button type="button" class="tk-claim" data-claim="${esc(t.id)}">领取</button>`
    : `<span class="tk-reward">${SHARD}${t.reward}</span>`;
  return `<li class="tk-row" data-state="${state}" data-id="${esc(t.id)}" style="--n:${i}">`
    + `<span class="tk-no">${String(i + 1).padStart(2, '0')}</span>`
    + `<span class="tk-main"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small>`
    + (t.goal > 1 ? `<span class="tk-prog"><span class="tk-pbar" style="--k:${p / t.goal}"><i></i></span><em>${p} / ${t.goal}</em></span>` : '')
    + `</span>${action}<i class="tk-sweep" aria-hidden="true"></i></li>`;
}

function paintAlbum(): void {
  const a = openAlbum;
  if (!a) return;
  const dlg = document.getElementById('album-dialog')!;
  const c = counts(a);
  const ts = tasksOf(a.id);
  dlg.style.setProperty('--al', a.color);
  dlg.querySelector('.ab-cover')!.innerHTML = coverHTML(a);
  dlg.querySelector('.ab-name')!.textContent = a.name;
  dlg.querySelector('.ab-side')!.textContent = `SIDE ${a.id === 'best' ? 'B' : 'A'} · ${ts.length} TRACKS`;
  dlg.querySelector('.ab-count')!.innerHTML = `${c.done}<small> / ${c.all}</small>`;
  (dlg.querySelector('.ab-bar') as HTMLElement).style.setProperty('--k', String(c.all ? c.done / c.all : 0));
  dlg.querySelector('.ab-list')!.innerHTML = ts.map((_, i) => rowHTML(a, i)).join('');
  const bid = albumBonusId(a.id);
  const bonusState = isClaimed(bid) ? 'got' : albumDone(a.id) ? 'ready' : 'todo';
  const bonus = dlg.querySelector<HTMLElement>('.ab-bonus')!;
  bonus.dataset.state = bonusState;
  bonus.innerHTML = `<span class="ab-frame">${frameHTML(a.frame)}</span><span class="ab-bonus-t"><small>全清奖励</small><b>${esc(itemName(a.frame))}</b><span>${SHARD}${a.bonus}</span></span>`
    + (bonusState === 'got' ? '<span class="tk-got" aria-label="已领取">✓</span>' : bonusState === 'ready' ? `<button type="button" class="tk-claim" data-claim="${esc(bid)}">领取</button>` : '<span class="ab-lock">完成全部曲目后解锁</span>');
  const all = dlg.querySelector<HTMLButtonElement>('.ab-claim-all')!;
  all.disabled = !c.ready;
  all.textContent = c.ready ? `领取本专辑全部 · ${c.ready}` : '暂无可领取';
  for (const b of dlg.querySelectorAll<HTMLButtonElement>('[data-claim]')) b.onclick = () => void claimRows([b.dataset.claim!]);
}

/** 领取：先让对应的行依次被一道光划过并打勾，再起奖励演出，碎片从这些行飞出来。 */
async function claimRows(ids: string[]): Promise<void> {
  const dlg = document.getElementById('album-dialog')!;
  const rowOf = (id: string) => id.startsWith('album:') ? dlg.querySelector<HTMLElement>('.ab-bonus') : dlg.querySelector<HTMLElement>(`.tk-row[data-id="${CSS.escape(id)}"]`);
  const rows = ids.map(rowOf).filter((x): x is HTMLElement => !!x);
  const sources = rows.map(r => r.getBoundingClientRect());
  const res = claim(ids);
  if (!res.count) return;
  if (!reduced()) {
    rows.forEach((r, i) => setTimeout(() => r.classList.add('swept'), i * 70));
    await new Promise(r => setTimeout(r, Math.min(700, rows.length * 70 + 260)));
  }
  await showReward({ shards: res.shards, items: res.items, sources, color: openAlbum?.color, title: openAlbum ? openAlbum.name : 'REWARD' });
  paintAlbum();
}

async function claimAllFromWall(): Promise<void> {
  if (!root) return;
  const list = claimable();
  if (!list.length) return;
  const albums = [...new Set(list.map(c => c.album))];
  const sources = albums.map(id => root!.querySelector<HTMLElement>(`.al-tile[data-album="${CSS.escape(id)}"] .al-art`)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
  if (!reduced()) {
    for (const [i, id] of albums.entries()) setTimeout(() => root!.querySelector(`.al-tile[data-album="${CSS.escape(id)}"]`)?.classList.add('swept'), i * 80);
    await new Promise(r => setTimeout(r, Math.min(800, albums.length * 80 + 260)));
  }
  const res = claim(list.map(c => c.id));
  await showReward({ shards: res.shards, items: res.items, sources, title: 'ALL CLEAR' });
  paintWall();
}

function showAlbum(a: AlbumDef): void {
  openAlbum = a;
  paintAlbum();
  const dlg = document.getElementById('album-dialog') as HTMLDialogElement;
  dlg.classList.remove('ab-in'); void dlg.offsetWidth; dlg.classList.add('ab-in');
  openDialog(dlg);
}

function mount(host: HTMLElement): void {
  root = host;
  host.innerHTML = `<div class="tk">
  <div class="tk-top">
    <div class="tk-sum"><small>COMPLETED</small><b class="tk-sum-n"></b><span class="tk-sum-bar"><i></i></span></div>
    <p class="tk-hint">每个乐队一张专辑。完成曲目里的任务拿星之碎片，全清还有专属头像框。</p>
    <button type="button" class="tk-claim-all set-primary">${SHARD}<span></span></button>
  </div>
  <ol class="tk-wall"></ol>
</div>`;
  host.querySelector<HTMLButtonElement>('.tk-claim-all')!.onclick = () => void claimAllFromWall();
}

/** 选人页「任务」入口卡上的可领取数。 */
function paintTile(): void {
  const el = document.getElementById('bs-ready');
  if (!el) return;
  const n = claimable().length;
  el.hidden = !n;
  el.textContent = n ? `可领取 ${n}` : '';
}

export function bindTasksPage(open: (d: HTMLDialogElement) => void): void {
  openDialog = open;
  registerHubPage('tasks', {
    title: '任务', en: 'ALBUMS', mount,
    enter: () => { refreshPassive(); paintWall(); },
  });
  const dlg = document.getElementById('album-dialog') as HTMLDialogElement;
  dlg.querySelector<HTMLButtonElement>('.ab-close')!.onclick = () => dlg.close();
  dlg.querySelector<HTMLButtonElement>('.ab-claim-all')!.onclick = () => { if (openAlbum) void claimRows(claimable(openAlbum.id).map(c => c.id)); };
  dlg.addEventListener('close', () => { openAlbum = null; paintWall(); });
  onTasks(() => { paintTile(); });
  refreshPassive();
  paintTile();
}

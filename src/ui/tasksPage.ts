/* 任务 = 专辑墙。每个乐队一张方形美术封面，封面下是完成数和细进度条。
   没全清的封面罩着一层塑封膜，贴一枚进度贴纸；领完全清奖励后，第一次回到墙上时塑封膜沿对角撕开，
   封面变亮面并盖上 CLEAR 章。最后一张「精选集」是通用成就。
   点封面打开「专辑背面」：曲目表式的任务列表，可单条领取，也可一键领取本专辑全部；墙顶上有全部领取。 */

import { reducedMotion } from './motion.ts';
import { ALBUMS, tasksOf, type AlbumDef } from '../tasks/defs.ts';
import { assetUrl } from '../assets/loader.ts';
import { albumBonusId, albumCleared, albumDone, claim, claimable, isClaimed, isDone, onTasks, progressOf, refreshPassive, totals } from '../tasks/progress.ts';
import { hubOpen, registerHubPage, setHubCount } from './hub.ts';
import { frameHTML, itemName } from './items.ts';
import { showReward } from './reward.ts';
import { phoneLayout, tickRail } from './mobile.ts';
import { openFramePreview } from './framePreview.ts';
import { has } from '../shop/state.ts';
import { clearBrowse } from './browse.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const reduced = reducedMotion;
const SHARD = '<svg class="tk-shard" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-shard"/></svg>';
const TORN_KEY = 'mf.albums.torn';

let root: HTMLElement | null = null;
let openAlbum: AlbumDef | null = null;
let visit = 0;
let albumTimer: ReturnType<typeof setTimeout> | undefined;
let preparingWall = false;
let wallDirty = false;
/** 从仓库「去任务」过来：进页后直接打开发这件奖励（头像框 id）的那张专辑。 */
let pendingFrame: string | null = null;
export function setTasksAlbum(frameId: string): void { pendingFrame = frameId; }
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

function tileHTML(a: AlbumDef, c: ReturnType<typeof counts>, state: string): string {
  return `<button type="button" class="al-tile" data-album="${esc(a.id)}" data-state="${state}" aria-label="${esc(a.name)}，完成 ${c.done} / ${c.all}${c.ready ? `，${c.ready} 项可领取` : ''}">`
    + `<span class="al-art" data-scheme="dark">${coverHTML(a)}`
    + '<span class="al-wrap" aria-hidden="true"><i></i><i></i></span>'
    + `<span class="al-sticker" aria-hidden="true">${c.done}<small>/${c.all}</small></span>`
    + '<span class="al-clear" aria-hidden="true">CLEAR</span>'
    + (c.ready ? `<span class="al-ready">可领取 ${c.ready}</span>` : '')
    + '</span>'
    + `<span class="al-meta"><b>${esc(a.name)}</b><small>${c.done} / ${c.all}</small></span>`
    + `<span class="al-bar" style="--k:${c.all ? c.done / c.all : 0}"><i></i></span>`
    + '</button>';
}

function paintWall(): void {
  if (preparingWall) { wallDirty = true; return; }
  for (const _ of buildWall()) { /* 领取后立即更新当前页面。 */ }
  startTears();
}

function paintHubCount(t: ReturnType<typeof totals>): void {
  /* 手机版的顶栏提供进度和全部领取。 */
  setHubCount(t.ready ? `全部领取 · ${t.ready}` : `${t.done}/${t.all}`, t.ready ? { act: () => void claimAllFromWall() } : { icon: 'n-tasks', label: `已完成 ${t.done}/${t.all}` });
}

function* buildWall(): Generator<void> {
  if (!root || hubOpen() !== 'tasks') return;
  const t = totals();
  root.querySelector('.tk-sum-n')!.innerHTML = `${t.done}<small> / ${t.all}</small>`;
  (root.querySelector('.tk-sum-bar') as HTMLElement).style.setProperty('--k', String(t.all ? t.done / t.all : 0));
  const all = root.querySelector<HTMLButtonElement>('.tk-claim-all')!;
  /* 没东西可领就不摆一颗灰掉的主按钮。 */
  all.hidden = !t.ready;
  all.disabled = !t.ready;
  all.querySelector('span')!.textContent = `全部领取 · ${t.ready}`;
  if (!preparingWall) paintHubCount(t);
  /* 进度没变就复用封面和按钮。 */
  const wall = root.querySelector<HTMLElement>('.tk-wall')!;
  const tornNow = torn();
  for (const [i, a] of ALBUMS.entries()) {
    const li = wall.children[i] as HTMLElement;
    const c = counts(a);
    const state = albumCleared(a.id) ? (tornNow.has(a.id) ? 'clear' : 'tearing') : 'sealed';
    const sig = `${c.done}/${c.all}/${c.ready}/${state}`;
    if (li.dataset.sig === sig) continue;
    li.dataset.sig = sig;
    li.innerHTML = tileHTML(a, c, state);
    yield;
  }
  sizeWall();
}

function startTears(): void {
  if (!root || hubOpen() !== 'tasks') return;
  /* 撕塑封：动画放完才记下，下次进来就是亮面。 */
  const fromVisit = visit;
  for (const b of root.querySelectorAll<HTMLElement>('.al-tile[data-state="tearing"]')) {
    const id = b.dataset.album!;
    if (reduced()) { markTorn(id); b.dataset.state = 'clear'; continue; }
    if (b.dataset.tearVisit === String(fromVisit) || b.classList.contains('tear')) continue;
    b.dataset.tearVisit = String(fromVisit);
    setTimeout(() => {
      if (visit !== fromVisit || !b.isConnected) return;
      b.classList.add('tear');
      setTimeout(() => { markTorn(id); b.dataset.state = 'clear'; b.classList.remove('tear'); }, 900);
    }, 500 + Math.random() * 200);
  }
}

/* 进度贴纸按封面宽度缩放（--u = 宽 / 100），墙上的格宽随窗口变，量出来写给 --cw。 */
let sizer: ResizeObserver | null = null;
function sizeWall(): void {
  const wall = root?.querySelector<HTMLElement>('.tk-wall');
  if (!wall) return;
  const measure = () => {
    /* 横屏手机：墙是两行横滑，封面边长由墙高定（两行封面 + 两行名字 + 行距）。 */
    if (phoneLayout() === 'land' && wall.clientHeight) wall.style.setProperty('--tile', Math.max(84, Math.floor((wall.clientHeight - 14 - 2 * 24) / 2)) + 'px');
    else wall.style.removeProperty('--tile');
    const art = wall.querySelector<HTMLElement>('.al-art');
    if (art?.offsetWidth) wall.style.setProperty('--cw', art.offsetWidth + 'px');
  };
  tickRail(wall);
  measure();
  if (!sizer && typeof ResizeObserver !== 'undefined') { sizer = new ResizeObserver(measure); sizer.observe(wall); }
}

function rowHTML(a: AlbumDef, i: number): string {
  const t = tasksOf(a.id)[i];
  const p = progressOf(t), done = isDone(t), got = isClaimed(t.id);
  const state = got ? 'got' : done ? 'ready' : 'todo';
  const action = got ? '<span class="tk-got" aria-label="已领取">✓</span>'
    : done ? `<button type="button" class="tk-claim" data-cue="none" data-claim="${esc(t.id)}">领取</button>`
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
  /* 全清奖励的头像框可以点开看效果（右下角小眼睛表明可点）。 */
  bonus.innerHTML = `<button type="button" class="ab-frame" aria-label="查看${esc(itemName(a.frame))}的效果">${frameHTML(a.frame)}<span class="mc-peek" aria-hidden="true"><svg viewBox="0 0 256 256"><use href="#i-eye"/></svg></span></button><span class="ab-bonus-t"><small>全清奖励</small><b>${esc(itemName(a.frame))}</b><span>${SHARD}${a.bonus}</span></span>`
    + (bonusState === 'got' ? '<span class="tk-got" aria-label="已领取">✓</span>' : bonusState === 'ready' ? `<button type="button" class="tk-claim" data-cue="none" data-claim="${esc(bid)}">领取</button>` : '<span class="ab-lock">完成全部曲目后解锁</span>');
  const all = dlg.querySelector<HTMLButtonElement>('.ab-claim-all')!;
  all.hidden = !c.ready;
  all.disabled = !c.ready;
  all.textContent = `领取本专辑全部 · ${c.ready}`;
  for (const b of dlg.querySelectorAll<HTMLButtonElement>('[data-claim]')) b.onclick = () => void claimRows([b.dataset.claim!]);
  dlg.querySelector<HTMLButtonElement>('.ab-frame')!.onclick = () => {
    clearBrowse();
    openFramePreview(a.frame, () => ({ owned: has(a.frame), note: `${a.name} · 全清奖励`, action: null }), () => {});
  };
}

/** 领取：先让对应的行依次被一道光划过并打勾，再起奖励演出，碎片从这些行飞出来。 */
async function claimRows(ids: string[]): Promise<void> {
  const dlg = document.getElementById('album-dialog') as HTMLDialogElement;
  const album = openAlbum;
  const fromVisit = visit;
  const rowOf = (id: string) => id.startsWith('album:') ? dlg.querySelector<HTMLElement>('.ab-bonus') : dlg.querySelector<HTMLElement>(`.tk-row[data-id="${CSS.escape(id)}"]`);
  const rows = ids.map(rowOf).filter((x): x is HTMLElement => !!x);
  const sources = rows.map(r => r.getBoundingClientRect());
  const res = claim(ids);
  if (!res.count) return;
  if (!reduced()) {
    rows.forEach((r, i) => setTimeout(() => r.classList.add('swept'), i * 70));
    await new Promise(r => setTimeout(r, Math.min(700, rows.length * 70 + 260)));
  }
  if (visit !== fromVisit || !dlg.open || openAlbum !== album) return;
  await showReward({ shards: res.shards, items: res.items, sources, color: album?.color, title: album?.name ?? 'REWARD' });
  paintAlbum();
}

async function claimAllFromWall(): Promise<void> {
  if (!root || preparingWall) return;
  const fromVisit = visit;
  const list = claimable();
  if (!list.length) return;
  const albums = [...new Set(list.map(c => c.album))];
  const sources = albums.map(id => root!.querySelector<HTMLElement>(`.al-tile[data-album="${CSS.escape(id)}"] .al-art`)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r);
  if (!reduced()) {
    for (const [i, id] of albums.entries()) setTimeout(() => root!.querySelector(`.al-tile[data-album="${CSS.escape(id)}"]`)?.classList.add('swept'), i * 80);
    await new Promise(r => setTimeout(r, Math.min(800, albums.length * 80 + 260)));
  }
  const res = claim(list.map(c => c.id));
  if (res.count && visit === fromVisit) await showReward({ shards: res.shards, items: res.items, sources, title: 'ALL CLEAR' });
  paintWall();
}

function showAlbum(a: AlbumDef): void {
  openAlbum = a;
  paintAlbum();
  const dlg = document.getElementById('album-dialog') as HTMLDialogElement;
  openDialog(dlg);
}

function mount(host: HTMLElement): void {
  root = host;
  host.innerHTML = `<div class="tk">
  <div class="tk-top">
    <div class="tk-sum"><small>COMPLETED</small><b class="tk-sum-n"></b><span class="tk-sum-bar"><i></i></span></div>
    <p class="tk-hint">每个乐队一张专辑。完成曲目里的任务拿星之碎片，全清还有专属头像框。</p>
    <button type="button" class="tk-claim-all set-primary" data-cue="none">${SHARD}<span></span></button>
  </div>
  <ol class="tk-wall">${ALBUMS.map((_, i) => `<li style="--n:${i}"></li>`).join('')}</ol>
</div>`;
  host.querySelector<HTMLButtonElement>('.tk-claim-all')!.onclick = () => void claimAllFromWall();
  host.querySelector<HTMLOListElement>('.tk-wall')!.onclick = e => {
    const button = e.target instanceof Element ? e.target.closest<HTMLElement>('.al-tile') : null;
    const album = ALBUMS.find(a => a.id === button?.dataset.album);
    if (album) showAlbum(album);
  };
}

/** 选人页「任务」入口卡上的可领取数。 */
function paintTile(): void {
  const el = document.getElementById('bs-ready');
  if (!el) return;
  const n = claimable().length;
  if (el.hidden !== !n) el.hidden = !n;
  const text = n ? `可领取 ${n}` : '';
  if (el.textContent !== text) el.textContent = text;
}

export function bindTasksPage(open: (d: HTMLDialogElement) => void): void {
  openDialog = open;
  registerHubPage('tasks', {
    title: '任务', en: 'ALBUMS', mount,
    loading: { line: '唱片压制中', en: 'PRESSING RECORDS' },
    *enter() {
      preparingWall = true;
      refreshPassive();
      yield;
      do {
        wallDirty = false;
        yield* buildWall();
      } while (wallDirty);
    },
    ready() {
      preparingWall = false;
      if (wallDirty) paintWall();
      else { paintHubCount(totals()); startTears(); }
      const a = pendingFrame ? ALBUMS.find(x => x.frame === pendingFrame) : undefined;
      pendingFrame = null;
      /* 弹之前确认还在任务页（离开了还弹，专辑框会盖在大厅上）。 */
      if (a) albumTimer = setTimeout(() => showAlbum(a), reduced() ? 0 : 120);
    },
    leave() { preparingWall = false; visit++; pendingFrame = null; clearTimeout(albumTimer); },
  });
  const dlg = document.getElementById('album-dialog') as HTMLDialogElement;
  dlg.querySelector<HTMLButtonElement>('.ab-close')!.onclick = () => dlg.close();
  dlg.querySelector<HTMLButtonElement>('.ab-claim-all')!.onclick = () => { if (openAlbum) void claimRows(claimable(openAlbum.id).map(c => c.id)); };
  dlg.addEventListener('close', () => { openAlbum = null; paintWall(); });
  onTasks(() => { if (preparingWall) wallDirty = true; paintTile(); });
  refreshPassive();
  paintTile();
}

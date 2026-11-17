/* 后台四个页面（商店 / 仓库 / 任务 / 音乐库）的壳：选人页底部的入口卡、全屏页面的开合、顶栏的碎片计数。
   开合：页面从被点的那张卡的位置铺开（clip-path 从卡片矩形展到全屏），关上时收回那张卡。
   每个页面第一次进入播完整开场，之后都是 ≤300ms 的快速版，反复进出不拖沓。 */

import { onWallet, shards } from '../save/wallet.ts';

export type HubId = 'shop' | 'locker' | 'tasks' | 'music';

export interface HubPage {
  title: string;
  en: string;
  /** 建一次，之后复用。 */
  mount(host: HTMLElement): void;
  /** 每次打开。first：这台设备第一次进这一页，可以把开场做足。 */
  enter?(first: boolean): void;
  leave?(): void;
}

const $ = (id: string) => document.getElementById(id)!;
const NO: Record<HubId, string> = { shop: 'A', locker: 'B', tasks: 'C', music: 'D' };
const SEEN_KEY = 'mf.hub.seen';
const pages = new Map<HubId, HubPage>();
const hosts = new Map<HubId, HTMLElement>();
let current: HubId | null = null;
let opener: HTMLElement | null = null;
let busy: Animation | null = null;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function seen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function markSeen(id: HubId): void {
  const s = seen();
  if (s.has(id)) return;
  s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* 下次还当第一次 */ }
}

export function registerHubPage(id: HubId, page: HubPage): void { pages.set(id, page); }

/* ---- 碎片计数：所有 [data-shards] 一起滚。 ---- */
let shown = shards();
let rollRaf = 0;
function paintShards(n: number): void {
  const text = Math.round(n).toLocaleString('en-US');
  for (const el of document.querySelectorAll<HTMLElement>('[data-shards]')) el.textContent = text;
}
function rollTo(target: number): void {
  cancelAnimationFrame(rollRaf);
  const from = shown, t0 = performance.now(), dur = reduced() ? 0 : Math.min(900, 300 + Math.abs(target - from) * 4);
  const step = (now: number) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    shown = from + (target - from) * (1 - (1 - k) ** 3);
    paintShards(shown);
    if (k < 1) rollRaf = requestAnimationFrame(step);
    else { shown = target; paintShards(target); }
  };
  rollRaf = requestAnimationFrame(step);
  for (const chip of document.querySelectorAll<HTMLElement>('.shard-chip')) {
    chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
  }
}

/** 页面按卡片矩形裁出来的形状。 */
function clipFrom(r: DOMRect): string {
  const w = window.innerWidth, h = window.innerHeight;
  return `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px round 18px)`;
}

export function hubOpen(): HubId | null { return current; }

export function openHub(id: HubId, from?: HTMLElement | null): void {
  const page = pages.get(id);
  if (!page || current === id) return;
  const hub = $('hub');
  if (current) leavePage(current);
  current = id;
  opener = from ?? null;
  $('hub-no').textContent = NO[id];
  $('hub-title').textContent = page.title;
  $('hub-en').textContent = page.en;
  let host = hosts.get(id);
  if (!host) {
    host = document.createElement('div');
    host.className = 'hub-page';
    host.dataset.page = id;
    $('hub-scroll').append(host);
    page.mount(host);
    hosts.set(id, host);
  }
  for (const [k, el] of hosts) el.hidden = k !== id;
  const first = !seen().has(id);
  markSeen(id);
  hub.dataset.page = id;
  hub.classList.toggle('first', first);
  hub.hidden = false;
  document.documentElement.classList.add('hub-open');
  $('hub-scroll').scrollTop = 0;
  busy?.cancel();
  /* clip-path 以外的点击会穿透到选人页。先摘掉后面的焦点和点击，铺满后再整块停画。 */
  const shield = (on: boolean) => {
    for (const el of [document.getElementById('selection'), document.querySelector('body > header'), document.querySelector('.site-foot')]) el?.toggleAttribute('inert', on);
  };
  shield(true);
  const cover = () => { if (current) document.documentElement.classList.add('hub-covered'); };
  if (!reduced() && from) {
    const r = from.getBoundingClientRect();
    busy = hub.animate([{ clipPath: clipFrom(r) }, { clipPath: 'inset(0 0 0 0 round 0px)' }],
      { duration: first ? 560 : 300, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    busy.onfinish = cover;
  } else cover();
  hub.classList.remove('entering'); void hub.offsetWidth; hub.classList.add('entering');
  page.enter?.(first);
  ($('hub-back') as HTMLButtonElement).focus({ preventScroll: true });
}

function leavePage(id: HubId): void { pages.get(id)?.leave?.(); }

export function closeHub(instant = false): void {
  if (!current) return;
  const hub = $('hub');
  const id = current;
  current = null;
  leavePage(id);
  document.documentElement.classList.remove('hub-covered');
  const done = () => {
    hub.hidden = true;
    hub.classList.remove('entering', 'first');
    document.documentElement.classList.remove('hub-open');
    for (const el of [document.getElementById('selection'), document.querySelector('body > header'), document.querySelector('.site-foot')]) el?.removeAttribute('inert');
    opener?.focus({ preventScroll: true });
  };
  busy?.cancel();
  if (instant || reduced() || !opener?.isConnected) { done(); return; }
  /* 收回之前先让入口卡回到视野里，再朝它收。 */
  document.documentElement.classList.remove('hub-open');
  const r = opener.getBoundingClientRect();
  document.documentElement.classList.add('hub-open');
  busy = hub.animate([{ clipPath: 'inset(0 0 0 0 round 0px)' }, { clipPath: clipFrom(r) }],
    { duration: 260, easing: 'cubic-bezier(.4, 0, .6, 1)' });
  busy.onfinish = done;
  busy.oncancel = () => { if (!current) done(); };
}

export function bindHub(): void {
  paintShards(shown);
  onWallet(w => rollTo(w.shards));
  for (const tile of document.querySelectorAll<HTMLButtonElement>('.bs-tile')) {
    tile.onclick = () => openHub(tile.dataset.hub as HubId, tile);
  }
  $('hub-back').onclick = () => closeHub();
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !current || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    closeHub();
  });
}

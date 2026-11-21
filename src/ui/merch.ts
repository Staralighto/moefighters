/* 商店和仓库共用的两样东西：分类标签横条（带一块滑动的底色），和物品卡。 */

import { KINDS, type ItemDef, type Kind } from '../shop/catalog.ts';
import { itemPreviewHTML } from './items.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
export const SHARD = '<svg class="tk-shard" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-shard"/></svg>';

/** 分类图标：只在手机版式显示（桌面仍是文字标签）。 */
export const kindIcon = (id: string) => `<svg class="kind-ico" viewBox="0 0 256 256" aria-hidden="true"><use href="#${id}"/></svg>`;

export function tabsHTML(label: string): string {
  return `<div class="mt-tabs" role="tablist" aria-label="${esc(label)}"><i class="mt-ink" aria-hidden="true"></i>`
    + KINDS.map(k => `<button type="button" role="tab" data-kind="${k.kind}" data-cue="tab" aria-selected="false" aria-label="${k.name}">${kindIcon(k.icon)}<b>${k.name}</b><small>${k.en}</small><em class="kind-short" aria-hidden="true">${k.short}</em><i class="kind-n" aria-hidden="true"></i></button>`).join('')
    + '</div>';
}

/** 选中某个标签：底色块滑过去。first 时不带过渡（刚挂上 DOM）。 */
export function selectTab(host: HTMLElement, kind: Kind, instant = false): void {
  const bar = host.querySelector<HTMLElement>('.mt-tabs');
  if (!bar) return;
  let on: HTMLElement | null = null;
  for (const b of bar.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
    const sel = b.dataset.kind === kind;
    if (b.getAttribute('aria-selected') !== String(sel)) b.setAttribute('aria-selected', String(sel));
    const tabIndex = sel ? 0 : -1;
    if (b.tabIndex !== tabIndex) b.tabIndex = tabIndex;
    if (sel) on = b;
  }
  const ink = bar.querySelector<HTMLElement>('.mt-ink')!;
  if (!on) return;
  const left = on.offsetLeft, top = on.offsetTop, width = on.offsetWidth, height = on.offsetHeight;
  const barWidth = bar.clientWidth, scroll = bar.scrollLeft, overflow = bar.scrollWidth > barWidth + 1;
  /* 位置写成变量，横排 / 竖轨（横屏手机）由 CSS 各取所需。 */
  const geometry = { '--ix': `${left}px`, '--iy': `${top}px`, '--iw': `${width}px`, '--ih': `${height}px` };
  const changed = Object.entries(geometry).filter(([key, value]) => ink.style.getPropertyValue(key) !== value);
  if (changed.length) {
    if (instant) ink.style.transition = 'none';
    for (const [key, value] of changed) ink.style.setProperty(key, value);
    if (instant) { void ink.offsetWidth; ink.style.transition = ''; }
  }
  /* 只有标签条真的横向溢出时才把选中项滚进来。竖排的分类栏（横屏手机）带上滚动条后可用宽度变窄，
     这里会误判「出界」，scrollIntoView 顺手把整列竖着滚走，第一项的头就被截掉。 */
  const r = left - scroll;
  if (overflow && (r < 0 || r + width > barWidth)) bar.scrollTo({ left: left - (barWidth - width) / 2, behavior: instant ? 'auto' : 'smooth' });
}

export function bindTabs(host: HTMLElement, onPick: (k: Kind) => void): void {
  const bar = host.querySelector<HTMLElement>('.mt-tabs')!;
  /* 转屏时标签条在横排和竖轨之间切换，滑块按新位置重量一次。 */
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(([entry]) => {
    if (!entry.contentRect.width) return;
    const on = bar.querySelector<HTMLElement>('[aria-selected="true"]');
    if (on) selectTab(host, on.dataset.kind as Kind, true);
  }).observe(bar);
  const tabs = [...bar.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  for (const b of tabs) b.onclick = () => onPick(b.dataset.kind as Kind);
  bar.onkeydown = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex(b => b.getAttribute('aria-selected') === 'true');
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    onPick(next.dataset.kind as Kind);
  };
}

export interface CardState {
  owned: boolean;
  /** 仓库：正在用。 */
  worn?: boolean;
  /** 底部按钮的字和动作名；null 不放按钮。 */
  action?: { label: string; act: string; disabled?: boolean } | null;
  /** 底部小字（获取途径、说明）。 */
  note?: string;
}

/** 触屏上没有悬停：卡片角上常驻一枚「可以点开看」的小图标（桌面隐藏，仍是悬停字）。 */
export const peekHTML = (kind: Kind) => `<span class="mc-peek" aria-hidden="true"><svg viewBox="0 0 256 256"><use href="#${kind === 'finale' ? 'i-play' : 'i-eye'}"/></svg></span>`;

export function cardHTML(item: ItemDef, s: CardState, i: number): string {
  const tag = item.price != null && !s.owned
    ? `<span class="mc-tag"><svg class="lock-ico" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-lock"/></svg>${SHARD}<b>${item.price}</b></span>` : '';
  const stamp = s.owned && item.price != null && s.worn === undefined ? '<span class="mc-stamp" aria-hidden="true"><svg class="own-ico" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-check"/></svg><span class="own-t">已拥有</span></span>' : '';
  const worn = s.worn ? '<span class="mc-worn">使用中</span>' : '';
  /* 去商店 / 去任务是跳转（.mc-go），横屏的仓库卡片不放：卡上有锁和价格，点卡片看详情，详情里有跳转。 */
  const go = s.action?.act === 'shop' || s.action?.act === 'tasks';
  const btn = s.action ? `<button type="button" class="mc-btn${go ? ' mc-go' : ''}${s.action.act === 'buy' || s.action.act === 'wear' ? ' set-primary' : ''}"${s.action.act === 'wear' ? ' data-cue="confirm"' : ''} data-act="${s.action.act}" data-id="${esc(item.id)}"${s.action.disabled ? ' disabled' : ''}>${s.action.act === 'buy' ? SHARD : ''}${esc(s.action.label)}</button>` : '';
  return `<li class="mc" data-id="${esc(item.id)}" data-kind="${item.kind}" data-owned="${s.owned}"${s.worn ? ' data-worn="true"' : ''} style="--n:${i}">`
    + `<div class="mc-art">${itemPreviewHTML(item.id)}${tag}${stamp}${worn}${peekHTML(item.kind)}</div>`
    + `<div class="mc-body"><b>${esc(item.name)}</b>${s.note ? `<small${tag && /^商店 · /.test(s.note) ? ' class="mc-note-price"' : ''}>${esc(s.note)}</small>` : ''}${btn}</div></li>`;
}

/** 空分类：一个空衣架。 */
export function emptyHTML(title: string, sub: string): string {
  return `<li class="mc mc-empty"><div class="mc-art"><svg class="hanger" viewBox="0 0 120 70" aria-hidden="true"><path d="M60 22c0-7 5-11 10-11s9 4 9 9c0 6-6 7-9 10L60 36 8 60h104L60 36"/></svg></div><div class="mc-body"><b>${esc(title)}</b><small>${esc(sub)}</small></div></li>`;
}

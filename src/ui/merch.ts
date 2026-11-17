/* 商店和仓库共用的两样东西：分类标签横条（带一块滑动的底色），和物品卡。 */

import { KINDS, type ItemDef, type Kind } from '../shop/catalog.ts';
import { itemPreviewHTML } from './items.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
export const SHARD = '<svg class="tk-shard" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-shard"/></svg>';

export function tabsHTML(label: string): string {
  return `<div class="mt-tabs" role="tablist" aria-label="${esc(label)}"><i class="mt-ink" aria-hidden="true"></i>`
    + KINDS.map(k => `<button type="button" role="tab" data-kind="${k.kind}" aria-selected="false"><b>${k.name}</b><small>${k.en}</small></button>`).join('')
    + '</div>';
}

/** 选中某个标签：底色块滑过去。first 时不带过渡（刚挂上 DOM）。 */
export function selectTab(host: HTMLElement, kind: Kind, instant = false): void {
  const bar = host.querySelector<HTMLElement>('.mt-tabs');
  if (!bar) return;
  let on: HTMLElement | null = null;
  for (const b of bar.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
    const sel = b.dataset.kind === kind;
    b.setAttribute('aria-selected', String(sel));
    b.tabIndex = sel ? 0 : -1;
    if (sel) on = b;
  }
  const ink = bar.querySelector<HTMLElement>('.mt-ink')!;
  if (!on) return;
  ink.style.transition = instant ? 'none' : '';
  ink.style.translate = `${on.offsetLeft}px 0`;
  ink.style.width = `${on.offsetWidth}px`;
  if (instant) { void ink.offsetWidth; ink.style.transition = ''; }
  const r = on.offsetLeft - bar.scrollLeft;
  if (r < 0 || r + on.offsetWidth > bar.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: instant ? 'auto' : 'smooth' });
}

export function bindTabs(host: HTMLElement, onPick: (k: Kind) => void): void {
  const bar = host.querySelector<HTMLElement>('.mt-tabs')!;
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

export function cardHTML(item: ItemDef, s: CardState, i: number): string {
  const tag = item.price != null && !s.owned
    ? `<span class="mc-tag">${SHARD}<b>${item.price}</b></span>` : '';
  const stamp = s.owned && item.price != null && s.worn === undefined ? '<span class="mc-stamp" aria-hidden="true">已拥有</span>' : '';
  const worn = s.worn ? '<span class="mc-worn">使用中</span>' : '';
  const btn = s.action ? `<button type="button" class="mc-btn${s.action.act === 'buy' || s.action.act === 'wear' ? ' set-primary' : ''}" data-act="${s.action.act}" data-id="${esc(item.id)}"${s.action.disabled ? ' disabled' : ''}>${s.action.act === 'buy' ? SHARD : ''}${esc(s.action.label)}</button>` : '';
  return `<li class="mc" data-id="${esc(item.id)}" data-kind="${item.kind}" data-owned="${s.owned}"${s.worn ? ' data-worn="true"' : ''} style="--n:${i}">`
    + `<div class="mc-art">${itemPreviewHTML(item.id)}${tag}${stamp}${worn}</div>`
    + `<div class="mc-body"><b>${esc(item.name)}</b>${s.note ? `<small>${esc(s.note)}</small>` : ''}${btn}</div></li>`;
}

/** 空分类：一个空衣架。 */
export function emptyHTML(title: string, sub: string): string {
  return `<li class="mc mc-empty"><div class="mc-art"><svg class="hanger" viewBox="0 0 120 70" aria-hidden="true"><path d="M60 22c0-7 5-11 10-11s9 4 9 9c0 6-6 7-9 10L60 36 8 60h104L60 36"/></svg></div><div class="mc-body"><b>${esc(title)}</b><small>${esc(sub)}</small></div></li>`;
}

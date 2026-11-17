/* 仓库：顶部一张印章册大卡（高级入口），下面按分类排全部物品。
   已拥有的可以装备（舞台、终幕拥有即生效），没拥有的压暗并写获取途径，点一下跳到商店那一栏或任务页。
   换主页样式时整页用 View Transition 交叉淡入，没有这个 API 的浏览器直接换。 */

import { KINDS, itemsOf, slotOf, type ItemDef, type Kind } from '../shop/catalog.ts';
import { current, has, wear } from '../shop/state.ts';
import { onInventory } from '../save/inventory.ts';
import { PLAYABLE_BY_ID } from '../data/characters.ts';
import { readStamps } from './stamps.ts';
import { openHub, registerHubPage } from './hub.ts';
import { bindTabs, cardHTML, emptyHTML, selectTab, tabsHTML } from './merch.ts';
import { setShopTab } from './shopPage.ts';
import { openFramePreview } from './framePreview.ts';
import { openFinalePreview } from './finalePreview.ts';
import { openItemPreview } from './itemPreview.ts';

let root: HTMLElement | null = null;
let kind: Kind = 'frame';
let animate = true;
let openStamps: () => void = () => {};

export function setLockerTab(k: Kind): void { kind = k; }

function stateOf(it: ItemDef): Parameters<typeof cardHTML>[1] {
  const owned = has(it.id);
  const slot = KINDS.find(k => k.kind === it.kind)?.slot;
  if (!owned) {
    return {
      owned: false,
      note: it.price != null ? `商店 · ${it.price} 星之碎片` : it.source ?? '暂未开放获取',
      action: it.price != null ? { label: '去商店', act: 'shop' } : it.source?.startsWith('任务') ? { label: '去任务', act: 'tasks' } : null,
    };
  }
  if (!slot) return { owned: true, worn: false, note: it.kind === 'finale' ? '已解锁 · 用必杀终结对手时播放' : '已解锁', action: null };
  const worn = current(it.kind, slotOf(it))?.id === it.id;
  return { owned: true, worn, note: it.base ? '默认款' : undefined, action: worn ? { label: '使用中', act: 'none', disabled: true } : { label: '使用', act: 'wear' } };
}

function paint(): void {
  if (!root) return;
  selectTab(root, kind, !animate);
  const all = itemsOf(kind);
  const sorted = [...all].sort((a, b) => Number(has(b.id)) - Number(has(a.id)));
  root.querySelector('.lk-kind')!.textContent = KINDS.find(k => k.kind === kind)?.name ?? '';
  root.querySelector('.lk-count')!.textContent = all.length ? `${all.filter(i => has(i.id)).length} / ${all.length}` : '';
  const grid = root.querySelector<HTMLElement>('.mc-grid')!;
  const cards = sorted.map((it, i) => cardHTML(it, stateOf(it), i));
  if (!cards.length) cards.push(emptyHTML(kind === 'skin' ? '暂无上架' : '这里还空着', kind === 'skin' ? '装备的位置已经留好' : '新内容筹备中'));
  grid.innerHTML = cards.join('');
  if (animate) { grid.classList.remove('mc-in'); void grid.offsetWidth; grid.classList.add('mc-in'); }
  for (const b of grid.querySelectorAll<HTMLButtonElement>('[data-act]')) b.onclick = () => act(b.dataset.act!, b.dataset.id!);
  for (const art of grid.querySelectorAll<HTMLElement>('.mc[data-id] .mc-art')) {
    const id = art.parentElement!.dataset.id!;
    const it = itemsOf(kind).find(i => i.id === id)!;
    const open = it.kind === 'finale' ? openFinalePreview : it.kind === 'frame' ? openFramePreview : openItemPreview;
    art.onclick = () => open(id, () => stateOf(it), what => act(what, id));
  }
  paintStampCard();
}

function act(what: string, id: string): void {
  const it = itemsOf(kind).find(i => i.id === id);
  if (!it) return;
  if (what === 'wear') {
    const go = () => { wear(it); animate = false; paint(); animate = true; };
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (it.kind === 'theme' && vt && !matchMedia('(prefers-reduced-motion: reduce)').matches) vt.call(document, go);
    else go();
    const card = root?.querySelector(`.mc[data-id="${CSS.escape(id)}"]`);
    card?.classList.add('worn-pop');
  } else if (what === 'shop') {
    setShopTab(it.kind, it.id);
    openHub('shop', root?.querySelector<HTMLElement>(`.mc[data-id="${CSS.escape(id)}"] .mc-btn`));
  } else if (what === 'tasks') {
    openHub('tasks', root?.querySelector<HTMLElement>(`.mc[data-id="${CSS.escape(id)}"] .mc-btn`));
  }
}

function paintStampCard(): void {
  const card = root?.querySelector('.lk-book');
  if (!card) return;
  const book = readStamps();
  const ids = Object.keys(book).filter(id => PLAYABLE_BY_ID.has(id));
  const gold = ids.filter(id => book[id].d === 2).length;
  card.querySelector('.lk-book-n')!.innerHTML = `${ids.length}<small> 枚</small>`;
  card.querySelector('.lk-book-gold')!.textContent = `大师 ${gold}`;
}

function mount(host: HTMLElement): void {
  root = host;
  host.innerHTML = `<div class="lk">
  <button type="button" class="lk-book">
    <span class="lk-book-seals" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="lk-book-t"><small>STAMP BOOK</small><b>印章册</b><em>慢慢翻，看看你击败过的每一位</em></span>
    <span class="lk-book-stat"><b class="lk-book-n"></b><small class="lk-book-gold"></small></span>
    <span class="lk-book-go" aria-hidden="true">→</span>
  </button>
  <div class="mt-bar">${tabsHTML('物品分类')}</div>
  <div class="mt-head"><b class="lk-kind"></b><small class="lk-count"></small></div>
  <ul class="mc-grid"></ul>
</div>`;
  bindTabs(host, k => { kind = k; paint(); });
  host.querySelector<HTMLButtonElement>('.lk-book')!.onclick = () => openStamps();
}

export function bindLockerPage(stamps: () => void): void {
  openStamps = stamps;
  registerHubPage('locker', {
    title: '仓库', en: 'MY LOCKER', mount,
    enter: () => { animate = true; paint(); },
  });
  onInventory(() => { if (root && !root.hidden) { animate = false; paint(); animate = true; } });
}

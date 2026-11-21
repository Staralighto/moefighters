/* 仓库：顶部一张印章册大卡（高级入口），下面按分类排全部物品。
   已拥有的可以装备（舞台、终幕拥有即生效），没拥有的压暗并写获取途径，点一下跳到商店那一栏或任务页。
   换主页样式时整页用 View Transition 交叉淡入，没有这个 API 的浏览器直接换。 */

import { FADE_OUT_MS, fadeIn, reducedMotion } from './motion.ts';
import { ITEM_BY_ID, KINDS, itemsOf, slotOf, type ItemDef, type Kind } from '../shop/catalog.ts';
import { current, has, wear } from '../shop/state.ts';
import { onInventory } from '../save/inventory.ts';
import { registerLayer } from './layerBack.ts';
import { PLAYABLE_BY_ID } from '../data/characters.ts';
import { readStamps } from './stamps.ts';
import { appendHubItems, hubOpen, openHub, registerHubPage, setHubCount } from './hub.ts';
import { bindTabs, cardHTML, emptyHTML, selectTab, tabsHTML } from './merch.ts';
import { setShopTab } from './shopPage.ts';
import { openFramePreview } from './framePreview.ts';
import { openFinalePreview } from './finalePreview.ts';
import { openItemPreview } from './itemPreview.ts';
import { fadeMore, onPhoneLayout, phoneLayout, tickRail } from './mobile.ts';
import { setBrowse } from './browse.ts';
import { setTasksAlbum } from './tasksPage.ts';
import { itemPreviewHTML } from './items.ts';
import { SHARD } from './merch.ts';

let root: HTMLElement | null = null;
/** 一个分类超过这么多件，手机上改用小方格总览（像原神 / 明日方舟的背包）；以内仍是大卡片。 */
const DENSE_OVER = 8;
/** 小方格模式下选中的那一件（横屏右栏显示它的详情）。 */
let pick: string | null = null;
/** 横屏：小卡片是否展开在 pick 那一格旁边。 */
let popOpen = false;
let popFrame = 0;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
let kind: Kind = 'frame';
let rendered: string | null = null;
let preparing = false;
let invalidated = false;
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
  /* 「使用中」已经有角标，不再放一颗灰掉的同名按钮。 */
  return { owned: true, worn, note: it.base ? '默认款' : undefined, action: worn ? null : { label: '使用', act: 'wear' } };
}

function* paint(instant = false): Generator<void> {
  if (!root) return;
  const all = itemsOf(kind);
  const owned: ItemDef[] = [], locked: ItemDef[] = [];
  for (const it of all) (has(it.id) ? owned : locked).push(it);
  const got = owned.length;
  /* 手机版式把标题行收掉，当前分类的收集进度挂到顶栏星之碎片左边。 */
  if (hubOpen() === 'locker') setHubCount(all.length ? `${got}/${all.length}` : null, { icon: 'n-locker', label: `已收集 ${got}/${all.length}` });
  const layout = phoneLayout();
  const key = `${layout}/${kind}`;
  if (rendered !== key) {
    rendered = null; // 中途离开时不能把半张货架当作热缓存。
    yield* paintItems([...owned, ...locked], layout !== null && all.length > DENSE_OVER, got);
    rendered = key;
  } else if (popOpen) placePop();
  paintStampCard();
  selectTab(root, kind, instant);
  fadeMore(root.querySelector<HTMLElement>('.mt-tabs')!);
}

function repaint(instant = false): void {
  for (const _ of paint(instant)) { /* 页内操作在当前任务提交。 */ }
}

function* paintItems(sorted: ItemDef[], dense: boolean, got: number): Generator<void> {
  if (!root) return;
  order = sorted;
  root.querySelector('.lk')!.toggleAttribute('data-dense', dense);
  root.querySelector('.lk-kind')!.textContent = KINDS.find(k => k.kind === kind)?.name ?? '';
  root.querySelector('.lk-count')!.textContent = sorted.length ? `${got} / ${sorted.length}` : '';
  const grid = root.querySelector<HTMLElement>('.mc-grid')!;
  const tiles = root.querySelector<HTMLElement>('.lk-tiles')!;
  if (dense) {
    grid.replaceChildren();
    if (!pick || !sorted.some(i => i.id === pick)) pick = (sorted.find(i => stateOf(i).worn) ?? sorted[0]).id;
    tiles.replaceChildren();
    yield* appendHubItems(tiles, sorted, tileHTML);
    tickRail(tiles);
    if (popOpen && phoneLayout() === 'land') { paintDetail(sorted.find(i => i.id === pick)!); placePop(); }
    else closePop();
  } else {
    closePop();
    tiles.replaceChildren();
    if (sorted.length) {
      grid.replaceChildren();
      yield* appendHubItems(grid, sorted, (it, i) => cardHTML(it, stateOf(it), i));
    }
    else grid.innerHTML = emptyHTML(kind === 'skin' ? '暂无上架' : '这里还空着', kind === 'skin' ? '装备的位置已经留好' : '新内容筹备中');
    tickRail(grid);
  }
}

const openerOf = (it: ItemDef) => it.kind === 'finale' ? openFinalePreview : it.kind === 'frame' ? openFramePreview : openItemPreview;
/** 当前分类的排序（和格子 / 卡片同一顺序），详情里左右滑按它翻。 */
let order: ItemDef[] = [];
/** 打开某一件的详情（带翻页上下文）。 */
function openItem(id: string): void {
  const it = ITEM_BY_ID.get(id);
  if (!it) return;
  setBrowse(order.map(i => i.id), id, openItem);
  openerOf(it)(it.id, () => stateOf(it), what => act(what, it.id));
}

/* ---- 小方格：格子只有预览和状态标记（未拥有压暗 + 小锁，使用中左上角小勾，选中描粉边），不放字。
   横屏点格子只换右栏详情；竖屏点格子直接弹出详情抽屉。 ---- */
function tileHTML(it: ItemDef, i: number): string {
  const s = stateOf(it);
  return `<li style="--n:${i}"><button type="button" class="lk-tile" data-id="${esc(it.id)}" data-owned="${s.owned}" aria-pressed="${popOpen && it.id === pick}" aria-label="${esc(it.name)}${s.worn ? '，使用中' : s.owned ? '' : '，未拥有'}">`
    + `<span class="lk-tile-art">${itemPreviewHTML(it.id)}</span>`
    + (s.worn ? '<svg class="lk-tile-worn" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-check"/></svg>' : '')
    + (s.owned ? '' : '<svg class="lk-tile-lock" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-lock"/></svg>')
    + '</button></li>';
}

/* ---- 横屏小卡片：从被点的那一格往右长出来（靠右边时往左），格子在下排时向上对齐；
   方格左右滑时跟着格子走，格子滑出视野就收起。点空白处、切分类也收起。 ---- */
/** 只露出半截的格子：先把这一排滑到它完整露出（留 12px），小卡片跟着滚动挪过去。 */
function revealTile(b: HTMLElement): void {
  const tiles = root?.querySelector<HTMLElement>('.lk-tiles');
  if (!tiles) return;
  const V = tiles.getBoundingClientRect(), T = b.getBoundingClientRect();
  const dx = T.right > V.right - 12 ? T.right - V.right + 12 : T.left < V.left + 12 ? T.left - V.left - 12 : 0;
  if (dx) tiles.scrollBy({ left: dx, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** 小卡片上左右甩：选中挪到上一件 / 下一件（和详情弹窗里翻页同一个手势）。 */
function stepPick(dir: -1 | 1): void {
  if (!pick || order.length < 2) return;
  const i = order.findIndex(x => x.id === pick);
  const next = order[(i + dir + order.length) % order.length];
  const b = root?.querySelector<HTMLElement>(`.lk-tile[data-id="${CSS.escape(next.id)}"]`);
  if (!b) return;
  pick = next.id;
  paintDetail(next);
  revealTile(b);
  placePop();
}

function closePop(): void {
  popOpen = false;
  const box = root?.querySelector<HTMLElement>('.lk-detail');
  if (box) delete box.dataset.open;
  root?.querySelector('.lk-tile[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
}

function placePop(): void {
  const lk = root?.querySelector<HTMLElement>('.lk');
  const box = root?.querySelector<HTMLElement>('.lk-detail');
  const tiles = root?.querySelector<HTMLElement>('.lk-tiles');
  const tile = pick && tiles ? tiles.querySelector<HTMLElement>(`.lk-tile[data-id="${CSS.escape(pick)}"]`) : null;
  if (!lk || !box || !tiles || !tile) { closePop(); return; }
  const L = lk.getBoundingClientRect(), T = tile.getBoundingClientRect(), V = tiles.getBoundingClientRect();
  if (T.right < V.left + 8 || T.left > V.right - 8) { closePop(); return; }
  if (tile.getAttribute('aria-pressed') !== 'true') {
    tiles.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
    tile.setAttribute('aria-pressed', 'true');
  }
  /* 卡片的一角从格子中心长出来：往右展开时格子钉在左上角，靠右边时往左展开、格子钉在右上角。
     先定方向（内容让出格子半个身位要按方向留边），再量卡片尺寸。 */
  const ax = T.left + T.width / 2 - L.left, ay = T.top + T.height / 2 - L.top;
  const opening = !box.dataset.open;
  if (opening) box.dataset.open = '1';
  const tw = `${Math.round(T.width)}px`;
  if (box.style.getPropertyValue('--tw') !== tw) box.style.setProperty('--tw', tw);
  const w = box.offsetWidth || 260, h = box.offsetHeight || 170;
  const flip = ax + w > L.width;
  const side = flip ? 'left' : 'right';
  if (box.dataset.side !== side) box.dataset.side = side;
  const left = flip ? ax - w : ax;
  const top = Math.min(Math.max(0, ay - 22), Math.max(0, L.height - h));
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
  /* 卡片角上那一格：和下面真正的格子严丝合缝地叠在一起，浮在卡片上面。 */
  const ghost = box.querySelector<HTMLElement>('.lk-pop-tile');
  if (ghost) {
    ghost.style.left = `${Math.round(T.left - L.left - left)}px`;
    ghost.style.top = `${Math.round(T.top - L.top - top)}px`;
    ghost.style.width = ghost.style.height = `${Math.round(T.width)}px`;
  }
  if (opening && !reducedMotion()) {
    box.style.transformOrigin = `${Math.round(ax - left)}px ${Math.round(ay - top)}px`;
    fadeIn(box, FADE_OUT_MS);
  }
}

const HINTS: Partial<Record<Kind, string>> = {
  frame: '战斗中双方头像都会换成这款。',
  ticket: '对战结算海报换成这一款票根。',
  theme: '全站的品牌色和背景几何换成这一套。',
  stage: '解锁后出现在选人页的场景里。',
  finale: '用必杀终结对手时播放。',
  skin: '这位角色的战斗形象换成这一套。',
};

/** 横屏小卡片（照明日方舟的物品卡分层）：反色名称块 + 看效果 / 一句作用说明 / 「获得方式」小标题 + 分割线 / 来源 · 状态 · 按钮一行。 */
function paintDetail(it: ItemDef): void {
  const box = root!.querySelector<HTMLElement>('.lk-detail')!;
  const s = stateOf(it);
  const a = s.action;
  const from = it.base ? '默认款' : it.price != null ? '商店' : it.source ?? '暂未开放';
  /* 状态小标签只写有信息量的：使用中 / 已拥有 / 价格。「未获得」和「去任务」按钮、小锁是一回事，不写，把宽度让给来源名。 */
  const chip = s.worn ? '使用中' : s.owned ? '已拥有' : it.price != null ? `${SHARD}${it.price}` : '';
  const arrow = a && a.act !== 'wear' ? '<svg class="btn-icon" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-caret-right"/></svg>' : '';
  const btn = a ? `<button type="button" class="lk-pop-go${a.act === 'wear' ? ' set-primary' : ''}" data-act="${a.act}"${a.act === 'wear' ? ' data-cue="confirm"' : ''}${a.disabled ? ' disabled' : ''}>${esc(a.label)}${arrow}</button>` : '';
  box.innerHTML = `<span class="lk-pop-tile" aria-hidden="true">${itemPreviewHTML(it.id)}</span>`
    + `<div class="lk-pop-head"><b class="lk-pop-name">${esc(it.name)}</b><button type="button" class="lk-pop-peek" aria-label="看效果"><svg class="btn-icon" viewBox="0 0 256 256" aria-hidden="true"><use href="#${it.kind === 'finale' ? 'i-play' : 'i-eye'}"/></svg></button></div>`
    + `<p class="lk-pop-desc">${esc(HINTS[it.kind] ?? '')}</p>`
    + '<p class="lk-pop-sec"><small>获得方式</small></p>'
    + `<div class="lk-pop-row"><span class="lk-pop-from">${esc(from)}</span>${chip ? `<em class="lk-pop-chip" data-state="${s.worn ? 'worn' : s.owned ? 'own' : 'none'}">${chip}</em>` : ''}${btn}</div>`;
  box.querySelector<HTMLButtonElement>('.lk-pop-peek')!.onclick = () => openItem(it.id);
  const b = box.querySelector<HTMLButtonElement>('[data-act]');
  if (b) b.onclick = () => act(b.dataset.act!, it.id);
}

function act(what: string, id: string): void {
  const it = itemsOf(kind).find(i => i.id === id);
  if (!it) return;
  if (what === 'wear') {
    const go = () => {
      wear(it); // 存档通知同步更新正在显示的仓库。
      root?.querySelector(`.mc[data-id="${CSS.escape(id)}"]`)?.classList.add('worn-pop');
    };
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (it.kind === 'theme' && vt && !reducedMotion()) vt.call(document, go);
    else go();
  } else if (what === 'shop') {
    setShopTab(it.kind, it.id);
    openHub('shop', root?.querySelector<HTMLElement>(`.mc[data-id="${CSS.escape(id)}"] .mc-btn`));
  } else if (what === 'tasks') {
    /* 直接打开发这件奖励的那张专辑背面，不让玩家在专辑墙上自己找。 */
    setTasksAlbum(it.id);
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
    <svg class="lk-book-ico" viewBox="0 0 256 256" aria-hidden="true"><use href="#i-seal"/></svg>
  </button>
  <div class="mt-bar">${tabsHTML('物品分类')}</div>
  <div class="mt-head"><b class="lk-kind"></b><small class="lk-count"></small></div>
  <ul class="mc-grid"></ul>
  <ul class="lk-tiles" aria-label="物品"></ul>
  <aside class="lk-detail" aria-live="polite"></aside>
</div>`;
  bindTabs(host, k => { if (kind !== k) { kind = k; closePop(); repaint(); } });
  host.querySelector<HTMLElement>('.mc-grid')!.onclick = e => {
    if (!(e.target instanceof Element)) return;
    const action = e.target.closest<HTMLElement>('[data-act]');
    if (action) act(action.dataset.act!, action.dataset.id!);
    else {
      const item = e.target.closest('.mc-art')?.closest<HTMLElement>('.mc[data-id]');
      if (item) openItem(item.dataset.id!);
    }
  };
  const tiles = host.querySelector<HTMLElement>('.lk-tiles')!;
  tiles.onclick = e => {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('.lk-tile') : null;
    const it = b && ITEM_BY_ID.get(b.dataset.id!);
    if (!b || !it) return;
    if (phoneLayout() !== 'land') { openItem(it.id); return; }
    if (popOpen && pick === it.id) { closePop(); return; }
    pick = it.id;
    popOpen = true;
    paintDetail(it);
    revealTile(b);
    placePop();
  };
  host.querySelector<HTMLButtonElement>('.lk-book')!.onclick = () => openStamps();
  tiles.addEventListener('scroll', () => {
    if (!popOpen || popFrame) return;
    popFrame = requestAnimationFrame(() => {
      popFrame = 0;
      if (popOpen && hubOpen() === 'locker') placePop();
    });
  }, { passive: true });
  const pop = host.querySelector<HTMLElement>('.lk-detail')!;
  let sx = 0, sy = 0;
  pop.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  pop.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) stepPick(dx < 0 ? 1 : -1);
  }, { passive: true });
  /* 点小卡片和方格以外的地方：收起。 */
  host.addEventListener('pointerdown', e => {
    if (popOpen && e.target instanceof Element && !e.target.closest('.lk-detail, .lk-tile')) closePop();
  });
}

export function bindLockerPage(stamps: () => void): void {
  openStamps = stamps;
  /* 返回先收起小卡片，不直接退出仓库。 */
  registerLayer(() => { if (!popOpen) return false; closePop(); return true; });
  registerHubPage('locker', {
    title: '仓库', en: 'MY LOCKER', mount,
    loading: { line: '储物柜开锁中', en: 'UNLOCKING LOCKER' },
    *enter() {
      preparing = true;
      do {
        invalidated = false;
        yield* paint();
        if (invalidated) rendered = null;
      } while (invalidated);
    },
    ready() {
      preparing = false;
      if (invalidated) { rendered = null; repaint(true); }
    },
    leave() { preparing = false; },
  });
  const refresh = () => {
    if (!root || hubOpen() !== 'locker') return;
    if (preparing) invalidated = true;
    else repaint(true);
  };
  onInventory(() => { rendered = null; refresh(); });
  /* 转屏：小方格 / 大卡片、右栏详情 / 弹抽屉跟着版式换。 */
  onPhoneLayout(refresh);
}

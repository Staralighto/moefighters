/* 商店 = 演唱会物贩摊。和仓库（标签 + 格子，管理用）刻意不同：
   - 顶部一座「聚光展台」：一束暖色顶光，放「今日推荐」（按日期固定挑一件，只是展示，没有限时）的大预览和购买。
   - 分类用一串「吊牌招牌」切换：一根挂着小灯泡的电线，每个分类是一块用两根细绳吊着的招牌，选中的那块亮灯。
     仓库是胶囊标签，商店是吊牌，一眼分得清。
   - 招牌下面是这个分类的货架：一层层（每层一根横杆），商品挂在杆上，挂满一层换下一层。
     卡和仓库的格子一样大。点一件打开详情弹窗（头像框套在 HUD 上、终幕循环播放、其他物品大预览），在弹窗里买。
   - 展台购买即时提示，详情弹窗保留小票演出。
   第一次进商店先弹「首场赠礼」：在祥子和爱音里任选一个终幕免费。 */

import { reducedMotion } from './motion.ts';
import { ITEM_BY_ID, ITEMS, KINDS, itemsOf, type ItemDef, type Kind } from '../shop/catalog.ts';
import { buy, giftOptions, giftPending, has, takeGift } from '../shop/state.ts';
import { onInventory } from '../save/inventory.ts';
import { onWallet, shards } from '../save/wallet.ts';
import { appendHubItems, hubOpen, openHub, registerHubPage } from './hub.ts';
import { itemName, itemPreviewHTML } from './items.ts';
import { setLockerTab } from './lockerPage.ts';
import { kindIcon, peekHTML, SHARD } from './merch.ts';
import { charOfFinale, openFinalePreview } from './finalePreview.ts';
import { openFramePreview } from './framePreview.ts';
import { openItemPreview } from './itemPreview.ts';
import type { CardState } from './merch.ts';
import { showReward } from './reward.ts';
import { toast } from './toast.ts';
import { setBrowse } from './browse.ts';
import { buzz, cue, fadeMore, onPhoneLayout, phoneLayout, refuse, tickRail } from './mobile.ts';


const reduced = reducedMotion;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const forSale = (k: Kind) => itemsOf(k).filter(i => i.price != null);

let root: HTMLElement | null = null;
let dialogTimer: ReturnType<typeof setTimeout> | undefined;
let openDialog: (d: HTMLDialogElement) => void = d => d.showModal();
let spot: string | null = null;
let kind: Kind = 'frame';

/** 和原图分开存放的商店预览。新的商品即使没有缩略图也能展示。 */
function shopArt(it: ItemDef): string | undefined {
  return it.id === 'finale:sakiko' || it.id === 'finale:anon' ? it.art?.replace(/\.png$/, '-shop.webp') : it.art;
}

/** 手机不摆今日推荐展台：点任何一件都会打开详情弹窗，展台在手机上只是在抢货架的面积。 */
const wantSpot = () => phoneLayout() === null;

/** 今日推荐：按日期在没拥有的商品里固定挑一件（都有了就在全部商品里挑）。 */
function todays(): string | null {
  const all = ITEMS.filter(i => i.price != null);
  const pool = all.filter(i => !has(i.id));
  const list = pool.length ? pool : all;
  if (!list.length) return null;
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  return list[(n * 2654435761 >>> 0) % list.length].id;
}

/* ---- 货架 ---- */
function shelfItemHTML(it: ItemDef, i: number): string {
  const owned = has(it.id);
  return `<li style="--n:${i}"><button type="button" class="sf-item" data-id="${esc(it.id)}" data-kind="${it.kind}" data-owned="${owned}"${spot === it.id ? ' aria-current="true"' : ''}>`
    + '<i class="sf-hook" aria-hidden="true"></i>'
    + `<span class="sf-art">${itemPreviewHTML(it.id, shopArt(it))}${peekHTML(it.kind)}</span>`
    + `<span class="sf-name">${esc(it.name)}</span>`
    + shelfBadge(it, owned)
    + '</button></li>';
}

function shelfBadge(it: ItemDef, owned: boolean): string {
  return owned ? '<span class="sf-own">已拥有</span>' : `<span class="mc-tag">${SHARD}<b>${it.price}</b></span>`;
}

/** 空格子：只占位，和商品卡一样高（同样的内部结构），整格不可见。 */
function emptySlotHTML(i: number): string {
  return `<li style="--n:${i}" aria-hidden="true"><div class="sf-item sf-slot"><span class="sf-art"></span><span class="sf-name">&nbsp;</span><span class="sf-own">已拥有</span></div></li>`;
}


/** 一层货架放几件：和仓库格子同一条规则（格宽下限 = max(200px 或半行, 五等分)），2 到 5 件。 */
function perRow(): number {
  const w = root?.querySelector<HTMLElement>('.shelves')?.clientWidth || 1000;
  const gap = 20;
  const min = Math.max(Math.min(200, (w - gap) / 2), (w - 4 * gap) / 5);
  return Math.max(2, Math.min(5, Math.floor((w + gap) / (min + gap))));
}
let cols = 0;

/** 吊牌招牌：每个分类一块，挂在一根带灯泡的电线上。 */
function signsHTML(): string {
  return '<i class="sg-wire" aria-hidden="true"></i>' + KINDS.map((k, i) => {
    const n = forSale(k.kind).length;
    return `<button type="button" role="tab" class="sg" data-kind="${k.kind}" data-cue="tab" aria-selected="${k.kind === kind}" aria-label="${k.name}" style="--n:${i}">`
      + '<i class="sg-str" aria-hidden="true"></i><span class="sg-board">'
      + `${kindIcon(k.icon)}<b>${k.name}</b><small>${k.en}</small><em>${n ? n : '暂无上架'}</em><em class="kind-short" aria-hidden="true">${k.short}</em></span></button>`;
  }).join('');
}

function paintSigns(smooth: boolean): void {
  const bar = root?.querySelector<HTMLElement>('.sg-bar');
  if (!bar) return;
  let selected: HTMLButtonElement | undefined;
  for (const b of bar.querySelectorAll<HTMLButtonElement>('.sg')) {
    const on = b.dataset.kind === kind;
    if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on));
    if (b.tabIndex !== (on ? 0 : -1)) b.tabIndex = on ? 0 : -1;
    if (on) selected = b;
  }
  if (!selected) return;
  const left = selected.offsetLeft, width = selected.offsetWidth;
  const view = bar.clientWidth, r = left - bar.scrollLeft;
  if (r < 0 || r + width > view) bar.scrollTo({ left: left - (view - width) / 2, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
}

function bindSigns(): void {
  const bar = root!.querySelector<HTMLElement>('.sg-bar')!;
  bar.innerHTML = signsHTML();
  fadeMore(bar);
  const tabs = [...bar.querySelectorAll<HTMLButtonElement>('.sg')];
  /* 切分类时页面停在原处：记下滚动位置，重画后放回去（货架至少两层高，内容高度不会突然变矮）。 */
  const pick = (k: Kind) => {
    if (k === kind) return;
    const scroller = document.getElementById('hub-scroll');
    const top = scroller?.scrollTop ?? 0;
    kind = k;
    paintSigns(true);
    paintShelves();
    if (scroller) scroller.scrollTop = top;
  };
  for (const b of tabs) b.onclick = () => pick(b.dataset.kind as Kind);
  bar.onkeydown = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex(b => b.dataset.kind === kind);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    pick(next.dataset.kind as Kind);
  };
}

let lastShelves = '';
let lastOwnership = '';
let preparingShelves = false;
let shelvesDirty = false;

function* buildShelves(): Generator<void> {
  if (!root || hubOpen() !== 'shop') return;
  const host = root.querySelector<HTMLElement>('.shelves')!;
  const land = phoneLayout() === 'land';
  const columns = land ? 0 : perRow();
  cols = columns;
  const k = KINDS.find(x => x.kind === kind)!;
  const items = forSale(k.kind);
  const ownership = items.map(x => has(x.id));
  const key = `${k.kind}/${columns}`;
  const ownedKey = ownership.map(owned => Number(owned)).join('');
  const own = ownership.filter(Boolean).length;
  if (key === lastShelves) {
    if (ownedKey !== lastOwnership) {
      lastOwnership = ownedKey;
      host.querySelector('.sf-head em')!.textContent = `已拥有 ${own} / ${items.length}`;
      host.querySelectorAll<HTMLButtonElement>('button.sf-item').forEach((card, i) => {
        if (card.dataset.owned === String(ownership[i])) return;
        card.dataset.owned = String(ownership[i]);
        card.querySelector<HTMLElement>('.sf-own, .mc-tag')!.outerHTML = shelfBadge(items[i], ownership[i]);
      });
    }
    for (const card of host.querySelectorAll<HTMLElement>('[aria-current="true"]')) if (card.dataset.id !== spot) card.removeAttribute('aria-current');
    if (spot) host.querySelector(`[data-id="${CSS.escape(spot)}"]:not([aria-current])`)?.setAttribute('aria-current', 'true');
    return;
  }
  lastShelves = '';
  host.innerHTML = `<section class="sf${land ? ' sf-land' : ''}" data-kind="${k.kind}" role="tabpanel" aria-label="${k.name}">`
    + `<header class="sf-head"><b>${k.name}</b><small>${k.en}</small>${items.length ? `<em>已拥有 ${own} / ${items.length}</em>` : '<em>暂无上架</em>'}</header></section>`;
  const shelf = host.firstElementChild as HTMLElement;
  /* 横屏手机：一根横杆、一排商品，左右滑（不补空格子，没货挂一块牌子）。 */
  if (land) {
    if (items.length) {
      const rail = document.createElement('ul');
      rail.className = 'sf-row sf-rail';
      shelf.append(rail);
      yield* appendHubItems(rail, items, shelfItemHTML);
      tickRail(rail);
    } else shelf.insertAdjacentHTML('beforeend', '<div class="sf-empty"><span class="sf-sign"><b>即将上架</b><small>位置已经留好</small></span></div>');
  } else {
    /* 至少两层：不够的格子用看不见的空格补齐，切分类时高度不跳。 */
    const slots = Math.max(columns * 2, Math.ceil(items.length / columns) * columns);
    for (let start = 0; start < slots; start += columns) {
      const cells = Array.from({ length: columns }, (_, offset) => {
        const i = start + offset;
        return items[i] ? shelfItemHTML(items[i], i) : emptySlotHTML(i);
      });
      shelf.insertAdjacentHTML('beforeend', `<ul class="sf-row${start >= items.length ? ' sf-row-blank' : ''}" style="--cols:${columns}">${cells.join('')}</ul>`);
      yield;
    }
  }
  lastShelves = key;
  lastOwnership = ownedKey;
  watchWidth();
}

let sizer: ResizeObserver | null = null;
function watchWidth(): void {
  const host = root?.querySelector<HTMLElement>('.shelves');
  if (!host || sizer || typeof ResizeObserver === 'undefined') return;
  sizer = new ResizeObserver(() => { if (hubOpen() === 'shop' && phoneLayout() !== 'land' && perRow() !== cols) paintShelves(); });
  sizer.observe(host);
}
/* 转屏：货架在「多层」和「一排横滑」之间换结构。 */
onPhoneLayout(() => {
  if (!root || hubOpen() !== 'shop') return;
  if (!wantSpot()) spot = null;
  else if (!spot) spot = todays();
  paintSpot();
  paintShelves();
  paintSigns(false);
});

function paintShelves(): void {
  if (preparingShelves) { shelvesDirty = true; return; }
  for (const _ of buildShelves()) { /* 页内切分类或购买后立即刷新。 */ }
}

/* ---- 展台 ---- */
function viewHTML(it: ItemDef): string {
  const cls = it.kind === 'theme' ? 'ss-theme' : it.kind === 'ticket' ? 'ss-ticket' : 'ss-art';
  return `<div class="${cls}">${itemPreviewHTML(it.id, shopArt(it))}</div>`;
}

function infoHTML(it: ItemDef): string {
  const owned = has(it.id);
  const short = (it.price ?? 0) - shards();
  const kind = KINDS.find(k => k.kind === it.kind);
  const ult = it.kind === 'finale' ? charOfFinale(it.id)?.skills.find(s => s.key === 'L')?.name : '';
  const note = it.kind === 'frame' ? '战斗中双方头像都会换成这款。'
    : it.kind === 'finale' ? '本地对战中用必杀终结对手时播放。'
    : it.kind === 'theme' ? '全站的品牌色和背景几何换成这一套。' : '';
  /* 按钮永远写「购买」，不替玩家算账；碎片不够时价格变红、按钮压暗，点了说一句「星之碎片不够」（见 action）。 */
  const btn = owned
    ? '<button type="button" class="ss-btn" data-x="locker">去仓库</button>'
    : `<button type="button" class="ss-btn set-primary" data-x="buy" data-cue="none"${short > 0 ? ' aria-disabled="true"' : ''}>${SHARD}<span>购买</span></button>`;
  return '<p class="ss-kicker">今日推荐 · TODAY\'S PICK</p>'
    + `<h2 class="ss-name">${esc(itemName(it.id))}</h2>`
    + `<p class="ss-kind">${kind?.name ?? ''}${ult ? ` · 必杀「${esc(ult)}」` : ''}</p>`
    + (note ? `<p class="ss-note">${note}</p>` : '')
    + (owned ? '' : `<p class="ss-price${short > 0 ? ' short' : ''}">${SHARD}<b>${it.price}</b></p>`)
    + `<div class="ss-actions">${btn}<button type="button" class="ss-btn" data-x="detail">看效果</button></div>`;
}

function paintSpot(): void {
  if (!root || hubOpen() !== 'shop') return;
  const show = root.querySelector<HTMLElement>('.ss-show')!;
  const info = root.querySelector<HTMLElement>('.ss-info-body')!;
  const it = spot ? ITEM_BY_ID.get(spot) : undefined;
  const id = it?.id ?? '';
  if (show.dataset.item !== id) {
    show.dataset.item = id;
    show.innerHTML = it ? viewHTML(it) : '<div class="ss-art"><span class="sf-sign"><b>货架都在下面</b><small>挑一件看看吧</small></span></div>';
  }
  if (!it) {
    info.innerHTML = '<p class="ss-kicker">MERCH STAND</p><h2 class="ss-name">欢迎光临</h2>';
    return;
  }
  info.innerHTML = infoHTML(it);
}

function action(x: string, b: HTMLButtonElement): void {
  if (!spot || !root) return;
  if (x === 'buy') {
    if (b.getAttribute('aria-disabled') === 'true') { refuse(b); toast('星之碎片不够'); return; }
    purchase(spot);
  }
  else if (x === 'locker') { setLockerTab(ITEM_BY_ID.get(spot)?.kind ?? 'frame'); openHub('locker', b); }
  else if (x === 'detail') openDetail(spot);
}

/** 商店里一件物品的状态：没买的「购买」（碎片不够时压暗），买了的「去仓库」。 */
function shopState(id: string): CardState {
  const it = ITEM_BY_ID.get(id)!;
  if (has(id)) return { owned: true, note: '', action: { label: '去仓库', act: 'locker' } };
  const short = (it.price ?? 0) - shards();
  return { owned: false, note: '', action: { label: '购买', act: 'buy', disabled: short > 0 } };
}

function shopRun(id: string) {
  return (act: string): 'bought' | void => {
    if (act === 'locker') { setLockerTab(ITEM_BY_ID.get(id)?.kind ?? 'frame'); openHub('locker', root?.querySelector<HTMLElement>('.sh-locker')); return; }
    if (act !== 'buy') return;
    const res = buy(id);
    if (res === 'poor') { toast('星之碎片不够'); return; }
    if (res !== 'ok') { toast('没能放进仓库，请再试一次'); return; }
    if (spot === id) paintSpot();
    return 'bought';
  };
}

/** 点货架上的一件：打开它的详情弹窗。 */
function openDetail(id: string): void {
  const it = ITEM_BY_ID.get(id);
  if (!it) return;
  /* 弹窗里左右滑翻同一分类的上一件 / 下一件。 */
  setBrowse(forSale(it.kind).map(i => i.id), id, openDetail);
  const open = it.kind === 'frame' ? openFramePreview : it.kind === 'finale' ? openFinalePreview : openItemPreview;
  open(id, () => shopState(id), shopRun(id));
}

/* ---- 展台购买 ---- */
function purchase(id: string): void {
  const res = buy(id);
  if (res === 'poor') { toast('星之碎片不够'); return; }
  if (res !== 'ok' || !root) { if (res !== 'ok') toast('没能放进仓库，请再试一次'); return; }
  cue('buy');
  buzz(20);
  paintSpot();
  toast(`已放进仓库：${itemName(id)}`);
}

/** 只刷新展台按钮（碎片变了），不重画预览。 */
function refreshBuy(): void {
  if (!root || !spot || hubOpen() !== 'shop') return;
  const it = ITEM_BY_ID.get(spot);
  const b = root.querySelector<HTMLButtonElement>('.ss-btn[data-x="buy"]');
  if (!it || !b || it.price == null) return;
  const short = it.price - shards();
  if (short > 0) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
  root.querySelector('.ss-price')?.classList.toggle('short', short > 0);
}

/* ---- 首场赠礼 ---- */
function showGift(): void {
  const dlg = document.getElementById('gift-dialog') as HTMLDialogElement;
  const opts = giftOptions();
  if (!opts.length) return;
  let pick = opts[0].id;
  const grid = dlg.querySelector<HTMLElement>('.gf-grid')!;
  grid.innerHTML = opts.map((it, i) => `<button type="button" class="gf-card" data-id="${esc(it.id)}" aria-pressed="${i === 0}" style="--n:${i}">`
    + `<span class="gf-art">${itemPreviewHTML(it.id, shopArt(it))}</span>`
    + `<span class="gf-name"><b>${esc(it.name)}</b><small>终幕 · FINALE</small></span></button>`).join('');
  for (const b of grid.querySelectorAll<HTMLButtonElement>('.gf-card')) b.onclick = () => {
    pick = b.dataset.id!;
    for (const x of grid.querySelectorAll('.gf-card')) x.setAttribute('aria-pressed', String(x === b));
  };
  dlg.querySelector<HTMLButtonElement>('.gf-ok')!.onclick = async () => {
    if (!takeGift(pick)) return;
    const src = grid.querySelector(`.gf-card[data-id="${CSS.escape(pick)}"]`)?.getBoundingClientRect();
    dlg.close();
    await showReward({ shards: 0, items: [pick], sources: src ? [src] : [], title: 'GIFT' });
    paintSpot();
  };
  dlg.querySelector<HTMLButtonElement>('.gf-later')!.onclick = () => dlg.close();
  openDialog(dlg);
}

function mount(host: HTMLElement): void {
  root = host;
  host.innerHTML = `<div class="sh">
  <div class="sh-top"><span class="sh-sign">MERCH STAND · 物贩</span><button type="button" class="sh-locker" aria-label="去仓库"><span class="sh-locker-ico" aria-hidden="true"></span><span>仓库</span></button></div>
  <section class="ss" aria-label="展台" data-scheme="dark">
    <i class="ss-beam" aria-hidden="true"></i>
    <div class="ss-show"></div>
    <div class="ss-info"><div class="ss-info-body"></div></div>
  </section>
  <nav class="sg-bar" role="tablist" aria-label="商品分类"></nav>
  <div class="shelves"></div>
</div>`;
  bindSigns();
  host.querySelector<HTMLElement>('.ss-info-body')!.onclick = e => {
    const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button[data-x]') : null;
    if (button) action(button.dataset.x!, button);
  };
  host.querySelector<HTMLElement>('.shelves')!.onclick = e => {
    const item = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button.sf-item') : null;
    if (item) openDetail(item.dataset.id!);
  };
  host.querySelector<HTMLButtonElement>('.sh-locker')!.onclick = e => {
    const k = (spot && ITEM_BY_ID.get(spot)?.kind) || 'frame';
    setLockerTab(k);
    openHub('locker', e.currentTarget as HTMLElement);
  };
}

/** 仓库里「去商店」：把那件放上展台。 */
let pending: string | null = null;
export function setShopTab(k: Kind, id?: string): void {
  kind = k;
  pending = id && ITEM_BY_ID.get(id)?.price != null ? id : null;
}

export function bindShopPage(open: (d: HTMLDialogElement) => void): void {
  openDialog = open;
  registerHubPage('shop', {
    title: '商店', en: 'MERCH STAND', mount,
    loading: { line: '物贩摊位布置中', en: 'SETTING UP MERCH' },
    *enter() {
      preparingShelves = true;
      spot = wantSpot() ? todays() : null;
      paintSigns(false);
      do {
        shelvesDirty = false;
        yield* buildShelves();
      } while (shelvesDirty);
      yield;
      paintSpot();
    },
    ready() {
      preparingShelves = false;
      if (shelvesDirty) paintShelves();
      const id = pending;
      pending = null;
      const delay = reduced() ? 0 : 120;
      if (id) dialogTimer = setTimeout(() => openDetail(id), delay);
      else if (giftPending()) dialogTimer = setTimeout(showGift, delay);
    },
    leave() {
      preparingShelves = false;
      pending = null;
      clearTimeout(dialogTimer);
    },
  });
  onWallet(refreshBuy);
  onInventory(paintShelves);
}

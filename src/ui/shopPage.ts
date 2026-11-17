/* 商店 = 演唱会物贩摊。和仓库（标签 + 格子，管理用）刻意不同：
   - 顶部一座「聚光展台」：一束暖色顶光，放「今日推荐」（按日期固定挑一件，只是展示，没有限时）的大预览和购买。
   - 分类用一串「吊牌招牌」切换：一根挂着小灯泡的电线，每个分类是一块用两根细绳吊着的招牌，选中的那块亮灯、晃一下。
     仓库是胶囊标签，商店是吊牌，一眼分得清。
   - 招牌下面是这个分类的货架：一层层（每层一根横杆），商品挂在杆上，挂满一层换下一层。
     卡和仓库的格子一样大。点一件打开详情弹窗（头像框套在 HUD 上、终幕循环播放、其他物品大预览），在弹窗里买。
   - 买下后打印一张热敏小票，一行行吐出来，撕下、折起，收进仓库。
   第一次进商店先弹「首场赠礼」：在祥子和爱音里任选一个终幕免费。 */

import { ITEM_BY_ID, ITEMS, KINDS, itemsOf, type ItemDef, type Kind } from '../shop/catalog.ts';
import { staticUrl } from '../assets/loader.ts';
import { buy, frameArt, giftOptions, giftPending, has, takeGift } from '../shop/state.ts';
import { onInventory } from '../save/inventory.ts';
import { onWallet, shards } from '../save/wallet.ts';
import { openHub, registerHubPage } from './hub.ts';
import { itemName, itemPreviewHTML, themeHTML, ticketHTML } from './items.ts';
import { setLockerTab } from './lockerPage.ts';
import { SHARD } from './merch.ts';
import { paintHudScene, paintStageArt, sizeHudScene, warmFrameArt } from './framePreview.ts';
import { charOfFinale, openFinalePreview, playFinale, type FinalePlayer } from './finalePreview.ts';
import { openFramePreview } from './framePreview.ts';
import { openItemPreview } from './itemPreview.ts';
import { printReceipt } from './receipt.ts';
import type { CardState } from './merch.ts';
import { showReward } from './reward.ts';
import { toast } from './toast.ts';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const forSale = (k: Kind) => itemsOf(k).filter(i => i.price != null);

let root: HTMLElement | null = null;
let enterTick = 0;
let openDialog: (d: HTMLDialogElement) => void = d => d.showModal();
let spot: string | null = null;
let kind: Kind = 'frame';
let finale: FinalePlayer | null = null;
let muted = true;
let printing = false;

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
    + `<span class="sf-art">${itemPreviewHTML(it.id)}</span>`
    + `<span class="sf-name">${esc(it.name)}</span>`
    + (owned ? '<span class="sf-own">已拥有</span>' : `<span class="mc-tag">${SHARD}<b>${it.price}</b></span>`)
    + '</button></li>';
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
    return `<button type="button" role="tab" class="sg" data-kind="${k.kind}" aria-selected="${k.kind === kind}" style="--n:${i}">`
      + '<i class="sg-str" aria-hidden="true"></i><span class="sg-board">'
      + `<b>${k.name}</b><small>${k.en}</small><em>${n ? n : '暂无上架'}</em></span></button>`;
  }).join('');
}

function paintSigns(swing: boolean): void {
  const bar = root?.querySelector<HTMLElement>('.sg-bar');
  if (!bar) return;
  for (const b of bar.querySelectorAll<HTMLButtonElement>('.sg')) {
    const on = b.dataset.kind === kind;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && swing && !reduced()) { b.classList.remove('swing'); void b.offsetWidth; b.classList.add('swing'); }
    /* 只横向滚招牌条，不用 scrollIntoView（它会顺带把整页竖着滚走）。 */
    if (on) {
      const r = b.offsetLeft - bar.scrollLeft;
      if (r < 0 || r + b.offsetWidth > bar.clientWidth) bar.scrollTo({ left: b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2, behavior: swing && !reduced() ? 'smooth' : 'auto' });
    }
  }
}

function bindSigns(): void {
  const bar = root!.querySelector<HTMLElement>('.sg-bar')!;
  bar.innerHTML = signsHTML();
  const tabs = [...bar.querySelectorAll<HTMLButtonElement>('.sg')];
  /* 切分类时页面停在原处：记下滚动位置，重画后放回去（货架至少两层高，内容高度不会突然变矮）。 */
  const pick = (k: Kind) => {
    if (k === kind) return;
    const scroller = document.getElementById('hub-scroll');
    const top = scroller?.scrollTop ?? 0;
    kind = k;
    paintSigns(true);
    paintShelves(true);
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

function shelvesHTML(): string {
  cols = perRow();
  const k = KINDS.find(x => x.kind === kind)!;
  const items = forSale(k.kind);
  const own = items.filter(x => has(x.id)).length;
  /* 至少两层：不够的格子用看不见的空格补齐，切分类时高度不跳。 */
  const slots = Math.max(cols * 2, Math.ceil(items.length / cols) * cols);
  const cells = Array.from({ length: slots }, (_, i) => items[i] ? shelfItemHTML(items[i], i)
    : emptySlotHTML(i));
  const rows: string[] = [];
  for (let r = 0; r < slots; r += cols) rows.push(cells.slice(r, r + cols).join(''));
  const blank = (r: number) => r * cols >= items.length;
  return `<section class="sf" data-kind="${k.kind}" role="tabpanel" aria-label="${k.name}">`
    + `<header class="sf-head"><b>${k.name}</b><small>${k.en}</small>${items.length ? `<em>已拥有 ${own} / ${items.length}</em>` : '<em>暂无上架</em>'}</header>`
    + rows.map((r, i) => `<ul class="sf-row${blank(i) ? ' sf-row-blank' : ''}" style="--cols:${cols}">${r}</ul>`).join('')
    + '</section>';
}

function bindShelves(): void {
  for (const b of root?.querySelectorAll<HTMLButtonElement>('.sf-item') ?? []) b.onclick = () => openDetail(b.dataset.id!);
}

let sizer: ResizeObserver | null = null;
function watchWidth(): void {
  const host = root?.querySelector<HTMLElement>('.shelves');
  if (!host || sizer || typeof ResizeObserver === 'undefined') return;
  sizer = new ResizeObserver(() => { if (root && perRow() !== cols) paintShelves(); });
  sizer.observe(host);
}

/** fresh：进页时整排挂上去（带入场）；其余时候（买完、领完赠礼）静默重画，不重播入场。 */
function paintShelves(fresh = false): void {
  if (!root) return;
  const host = root.querySelector<HTMLElement>('.shelves')!;
  host.classList.toggle('quiet', !fresh);
  host.innerHTML = shelvesHTML();
  bindShelves();
  watchWidth();
}

/* ---- 展台 ---- */
function stopShow(): void { finale?.stop(); finale = null; }

function viewHTML(it: ItemDef): string {
  switch (it.kind) {
    case 'frame': return '<div class="fv-scene ss-scene" data-scheme="dark"><div class="hud faces"></div></div>';
    case 'finale': return '<div class="fn-stage ss-scene" data-scheme="dark"><canvas class="fn-canvas"></canvas><span class="fn-loading">载入中…</span></div>';
    case 'theme': return `<div class="ss-theme">${themeHTML(it.color ?? '#ff3b7f', it.id)}</div>`;
    case 'ticket': return `<div class="ss-ticket">${ticketHTML(it.id.split(':')[1])}</div>`;
    default: return `<div class="ss-art">${itemPreviewHTML(it.id)}</div>`;
  }
}

function infoHTML(it: ItemDef): string {
  const owned = has(it.id);
  const short = (it.price ?? 0) - shards();
  const kind = KINDS.find(k => k.kind === it.kind);
  const ult = it.kind === 'finale' ? charOfFinale(it.id)?.skills.find(s => s.key === 'L')?.name : '';
  const note = it.kind === 'frame' ? '战斗中双方头像都会换成这款。'
    : it.kind === 'finale' ? '本地对战中用必杀终结对手时播放。'
    : it.kind === 'theme' ? '全站的品牌色和背景几何换成这一套。' : '';
  const extra = it.kind === 'frame' ? '<button type="button" class="ss-x" data-x="shuffle">换一组角色</button>'
    : it.kind === 'finale' ? `<button type="button" class="ss-x" data-x="replay">重播</button><button type="button" class="ss-x" data-x="mute" aria-pressed="${!muted}">${muted ? '声音 关' : '声音 开'}</button>` : '';
  const btn = owned
    ? '<button type="button" class="ss-btn" data-x="locker">已拥有 · 去仓库使用</button>'
    : `<button type="button" class="ss-btn set-primary" data-x="buy"${short > 0 ? ' disabled' : ''}>${SHARD}${short > 0 ? `还差 ${short}` : '买下它'}</button>`;
  return '<p class="ss-kicker">今日推荐 · TODAY\'S PICK</p>'
    + `<h2 class="ss-name">${esc(itemName(it.id))}</h2>`
    + `<p class="ss-kind">${kind?.name ?? ''}${ult ? ` · 必杀「${esc(ult)}」` : ''}</p>`
    + (note ? `<p class="ss-note">${note}</p>` : '')
    + (owned ? '' : `<p class="ss-price">${SHARD}<b>${it.price}</b></p>`)
    + `<div class="ss-actions">${btn}${extra ? `<div class="ss-extra">${extra}</div>` : ''}</div>`;
}

function paintSpot(animateIn: boolean): void {
  if (!root) return;
  const show = root.querySelector<HTMLElement>('.ss-show')!;
  const info = root.querySelector<HTMLElement>('.ss-info-body')!;
  stopShow();
  const it = spot ? ITEM_BY_ID.get(spot) : undefined;
  if (!it) {
    show.innerHTML = '<div class="ss-art"><span class="sf-sign"><b>货架都在下面</b><small>挑一件看看吧</small></span></div>';
    info.innerHTML = '<p class="ss-kicker">MERCH STAND</p><h2 class="ss-name">欢迎光临</h2>';
    return;
  }
  show.innerHTML = viewHTML(it);
  info.innerHTML = infoHTML(it);
  const scene = show.querySelector<HTMLElement>('.ss-scene');
  if (scene) paintStageArt(scene);
  if (it.kind === 'frame' && scene) { paintHudScene(scene, it.id); sizeHudScene(scene); }
  if (it.kind === 'finale' && scene) {
    const char = charOfFinale(it.id);
    if (char) finale = playFinale(scene.querySelector('canvas')!, scene, char, () => muted);
  }
  for (const b of info.querySelectorAll<HTMLButtonElement>('[data-x]')) b.onclick = () => action(b.dataset.x!, b);
  if (animateIn && !reduced()) {
    show.animate([{ opacity: 0, scale: .96 }, { opacity: 1, scale: 1 }], { duration: 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    info.animate([{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], { duration: 320, delay: 60, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' });
  }
}

function action(x: string, b: HTMLButtonElement): void {
  if (!spot || !root) return;
  if (x === 'buy') purchase(spot);
  else if (x === 'locker') { setLockerTab(ITEM_BY_ID.get(spot)?.kind ?? 'frame'); openHub('locker', b); }
  else if (x === 'shuffle') { const scene = root.querySelector<HTMLElement>('.ss-scene'); if (scene) paintHudScene(scene, '__shuffle__'); paintHudFrameOnly(); }
  else if (x === 'replay') finale?.restart();
  else if (x === 'mute') { muted = !muted; b.textContent = muted ? '声音 关' : '声音 开'; b.setAttribute('aria-pressed', String(!muted)); }
}

/** 「换一组角色」：随机两位，但框还是展台上这一款。 */
function paintHudFrameOnly(): void {
  const scene = root?.querySelector<HTMLElement>('.ss-scene');
  const it = spot ? ITEM_BY_ID.get(spot) : undefined;
  if (!scene || !it) return;
  const hud = scene.querySelector<HTMLElement>('.hud')!;
  if (it.base) { delete hud.dataset.frame; hud.style.removeProperty('--fr'); }
  else { const key = it.id.split(':')[1]; hud.dataset.frame = key; hud.style.setProperty('--fr', it.color ?? 'var(--gold)'); hud.style.setProperty('--frimg', frameArt(key)); }
}

/** 商店里一件物品的状态：没买的「购买 / 还差 N」，买了的「去仓库使用」。 */
function shopState(id: string): CardState {
  const it = ITEM_BY_ID.get(id)!;
  if (has(id)) return { owned: true, note: '已经是你的了', action: { label: '已拥有 · 去仓库使用', act: 'locker' } };
  const short = (it.price ?? 0) - shards();
  return { owned: false, note: '', action: short > 0 ? { label: `还差 ${short}`, act: 'buy', disabled: true } : { label: '买下它', act: 'buy' } };
}

function shopRun(id: string) {
  return (act: string): 'bought' | void => {
    if (act === 'locker') { setLockerTab(ITEM_BY_ID.get(id)?.kind ?? 'frame'); openHub('locker', root?.querySelector<HTMLElement>('.sh-locker')); return; }
    if (act !== 'buy') return;
    const res = buy(id);
    if (res === 'poor') { toast('星之碎片不够'); return; }
    if (res !== 'ok') { toast('没能放进仓库，请再试一次'); return; }
    paintShelves();
    if (spot === id) paintSpot(false);
    return 'bought';
  };
}

/** 点货架上的一件：打开它的详情弹窗。 */
function openDetail(id: string): void {
  const it = ITEM_BY_ID.get(id);
  if (!it) return;
  const open = it.kind === 'frame' ? openFramePreview : it.kind === 'finale' ? openFinalePreview : openItemPreview;
  open(id, () => shopState(id), shopRun(id));
}

/* ---- 购买：打印小票 ---- */
function purchase(id: string): void {
  const res = buy(id);
  if (res === 'poor') { toast('星之碎片不够'); return; }
  if (res !== 'ok' || !root) { if (res !== 'ok') toast('没能放进仓库，请再试一次'); return; }
  const it = ITEM_BY_ID.get(id)!;
  printing = true;
  const done = () => { printing = false; paintSpot(false); paintShelves(); };
  if (reduced()) { toast(`已放进仓库：${itemName(id)}`); done(); return; }
  void printReceipt(root.querySelector<HTMLElement>('.ss-printer')!, it, root.querySelector<HTMLElement>('.sh-locker')).then(done);
}

/** 只刷新展台按钮（碎片变了），不重画预览。 */
function refreshBuy(): void {
  if (!root || !spot || printing) return;
  const it = ITEM_BY_ID.get(spot);
  const b = root.querySelector<HTMLButtonElement>('.ss-btn[data-x="buy"]');
  if (!it || !b || it.price == null) return;
  const short = it.price - shards();
  b.disabled = short > 0;
  b.lastChild!.textContent = short > 0 ? `还差 ${short}` : '买下它';
}

/* ---- 首场赠礼 ---- */
function showGift(): void {
  const dlg = document.getElementById('gift-dialog') as HTMLDialogElement;
  const opts = giftOptions();
  if (!opts.length) return;
  let pick = opts[0].id;
  const grid = dlg.querySelector<HTMLElement>('.gf-grid')!;
  grid.innerHTML = opts.map((it, i) => `<button type="button" class="gf-card" data-id="${esc(it.id)}" aria-pressed="${i === 0}" style="--n:${i}">`
    + `<span class="gf-art">${it.art ? `<img src="${esc(staticUrl(it.art))}" alt="" loading="lazy">` : ''}</span>`
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
    paintSpot(false);
    paintShelves();
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
    <div class="ss-info"><div class="ss-info-body"></div><div class="ss-printer" aria-hidden="true"></div></div>
  </section>
  <nav class="sg-bar" role="tablist" aria-label="商品分类"></nav>
  <div class="shelves"></div>
</div>`;
  bindSigns();
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
    enter: () => {
      const tick = ++enterTick;
      /* 框图先解码完再画（几个小 SVG）；舞台大图不挡货架，到了再挂。 */
      void warmFrameArt().then(() => {
        if (tick !== enterTick || !root) return;
        spot = todays();
        paintSpot(false);
        paintSigns(false);
        paintShelves(true);
        if (pending) { const id = pending; pending = null; setTimeout(() => openDetail(id), reduced() ? 0 : 360); }
        else if (giftPending()) setTimeout(showGift, reduced() ? 0 : 520);
      });
    },
    leave: () => { enterTick++; stopShow(); },
  });
  onWallet(refreshBuy);
  onInventory(() => { if (root && !root.hidden && !printing && document.documentElement.classList.contains('hub-open')) paintShelves(); });
}

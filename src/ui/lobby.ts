/* 大厅（mobile.ts 的 lobbyMode()：自动 = 横屏小屏手机；设置里可手动开 / 关）：选人页上面盖一层首页。
   背景只用终幕图：拥有的终幕里随机一张，一张都没有时在两张赠送终幕（祥子 / 爱音）里随机。以人脸为中心放大、缓慢漂移，
   入口群放在背对人脸的一侧。顶栏沿用站点 header（印章册、设置、音乐、说明），只换成浮在美术上的样子。
   入口群：作战 / 场景 / 招式三块「备战」，商店 / 仓库 / 任务 / 音乐库四格「后台」。
   备战三块点开后由 hub.ts 当作页面打开：把 #selection 里对应的那几块 DOM 原样搬进页面壳，关上时搬回原处。
   select.ts 的 id、监听、观察器都跟着节点走，不用改；只有舞台背景要在换了容器之后重新铺一次（relayout）。
   竖屏没有大厅，选人页仍是一整页滚动；横竖屏切换时按看到的位置互相映射（作战 / 场景 / 招式 ↔ 对应的那一段）。 */

import type { CharacterData } from '../data/types.ts';
import type { SelectScreen } from './select.ts';
import { assignFirst, applyImageUrl, stageThumbSrc } from '../assets/loader.ts';
import { itemsOf } from '../shop/catalog.ts';
import { owns } from '../save/inventory.ts';
import { closeHub, hubOpen, openHub, registerHubPage, setPrepMeta, type HubId, type HubPage } from './hub.ts';
import { lobbyMode, onPhoneLayout, phoneLayout } from './mobile.ts';
import { shortName } from '../data/shortNames.ts';
/** 大厅这边只关心「有没有大厅」：大厅模式下算 land；关了大厅模式的横屏手机不算横屏（没有大厅、选人页整页滚动）。 */
const layoutNow = () => lobbyMode() ? 'land' : phoneLayout() === 'land' ? null : phoneLayout();
import { settleAppHeight } from './appHeight.ts';

type PrepId = 'battle' | 'stage' | 'moves';
const PREP: readonly PrepId[] = ['battle', 'stage', 'moves'];
const isPrep = (id: string | null): id is PrepId => !!id && (PREP as readonly string[]).includes(id);

const $ = (id: string) => document.getElementById(id)!;
const root = document.documentElement;
const GIFT = ['finale:sakiko', 'finale:anon'];
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const face = (img: HTMLImageElement, c: CharacterData | undefined) => {
  if (!c || img.dataset.cid === c.id) return;
  img.dataset.cid = c.id;
  img.alt = c.name;
  assignFirst(img, [`/avatars/${c.id}.png`, '/avatars/placeholder.png']);
};

let select: SelectScreen;
/** 大厅在不在：横屏手机布局 + 选人页在台上（不在战斗里）。 */
let on = false;

/* ---- 背景：终幕图 ---- */
let artId = '';
function pickArt(): void {
  const all = itemsOf('finale');
  const mine = all.filter(i => owns(i.id));
  const pool = mine.length ? mine : all.filter(i => GIFT.includes(i.id));
  /* 已经选过、而且还拥有（或仍在赠送池里）就不换：同一次访问里回大厅不跳图。 */
  if (pool.some(i => i.id === artId)) return;
  const item = pool[Math.floor(Math.random() * pool.length)];
  if (!item?.art) return;
  artId = item.id;
  const fx = item.focus?.x ?? .5, fy = item.focus?.y ?? .3;
  const lobby = $('lobby');
  /* 脸在右半边，入口群放左边；反之放右边。 */
  lobby.dataset.side = fx > .5 ? 'left' : 'right';
  const art = $('lb-art');
  art.style.setProperty('--fx', `${fx * 100}%`);
  art.style.setProperty('--fy', `${fy * 100}%`);
  art.style.backgroundPosition = `${fx * 100}% ${fy * 100}%`;
  applyImageUrl(item.art, url => { if (artId === item.id) art.style.backgroundImage = `url("${url}")`; });
  $('lb-art-name').textContent = `终幕 · ${item.name}`;
}

/* ---- 摘要：大厅三块和导航的三站跟着选人页 ---- */
function paint(): void {
  const info = select.lobbyInfo();
  const [a, b] = [info.cast[0], info.cast[info.cast.length - 1]];
  face($('lb-a1') as HTMLImageElement, a);
  face($('lb-a2') as HTMLImageElement, b);
  $('lb-rules').textContent = info.rules;
  /* 块里只剩半宽，「RiNG · 咖啡厅」这类名字用紧凑的分隔点，窄屏也放得下。 */
  $('lb-stage').textContent = (info.stage?.name ?? '随机场景').replace(' · ', '·');
  const thumb = $('lb-thumb');
  const src = info.stage?.image ? stageThumbSrc(info.stage.image) : '';
  if (thumb.dataset.src !== src) {
    thumb.dataset.src = src;
    thumb.style.backgroundImage = '';
    if (src) applyImageUrl(src, url => { if (thumb.dataset.src === src) thumb.style.backgroundImage = `url("${url}")`; });
  }
  thumb.classList.toggle('rand', !src);
  $('lb-moves').textContent = `${info.owner.name} · ${info.moves} 招`;
  const quick = $('lobby-quick');
  quick.setAttribute('aria-disabled', $('start').getAttribute('aria-disabled') ?? 'false');
  const page = hubOpen();
  if (page === 'stage') paintStage(info);
  if (page === 'moves') paintWho(info);
}

/* ---- 备战三页 ---- */
/** 搬出去的节点原处留一个记号，搬回来插在记号后面。 */
const marks = new Map<Element, Comment>();
function borrow(el: Element | null, into: Element): void {
  if (!el) return;
  if (!marks.has(el)) {
    const m = document.createComment('lobby');
    el.before(m);
    marks.set(el, m);
  }
  into.append(el);
}
function giveBack(els: (Element | null)[]): void {
  for (const el of els) {
    const m = el && marks.get(el);
    if (m && el) m.after(el);
  }
}
const q = (sel: string) => document.querySelector(sel);
const parts: Record<PrepId, () => (Element | null)[]> = {
  battle: () => [q('#selection .stage-frame'), q('#selection .lobby-actions'), $('roster'), q('#selection .roster-foot')],
  stage: () => [q('#selection .stage-select')],
  moves: () => [q('#selection .bottom-grid')],
};
/** 已经搬出去的节点（parts 现查会落空：它们已经不在 #selection 里了）。 */
const lent = new Map<PrepId, (Element | null)[]>();

/** 换了容器：舞台背景、名册观察器按新尺寸重来。下一帧再量，等版式落定。 */
let relayoutFrame = 0;
function settle(): void {
  if (relayoutFrame) return;
  relayoutFrame = requestAnimationFrame(() => {
    relayoutFrame = requestAnimationFrame(() => { relayoutFrame = 0; select.relayout(); });
  });
}

/** 备战三页的加载说法（loadGate.ts）。 */
const PREP_LOADING: Record<PrepId, { line: string; en: string }> = {
  battle: { line: '乐手入场中', en: 'BAND ON STAGE' },
  stage: { line: '舞台布景搭建中', en: 'BUILDING THE SET' },
  moves: { line: '翻阅排练谱中', en: 'READING THE SCORE' },
};

function prepPage(id: PrepId, title: string, en: string, build: (host: HTMLElement) => Element[]): HubPage {
  let slots: Element[] = [];
  return {
    title, en, loading: PREP_LOADING[id],
    mount(host) {
      host.classList.add('prep');
      slots = build(host);
    },
    enter() {
      const els = lent.get(id) ?? parts[id]();
      lent.set(id, els);
      /* 第一块进第一个槽，其余按顺序进最后一个槽（作战：舞台在左，模式 / 名册 / 开打在右）。 */
      els.forEach((el, i) => borrow(el, slots[Math.min(i, slots.length - 1)]));
      paint();
      if (id === 'battle') settle();
    },
    leave() {
      giveBack(lent.get(id) ?? []);
      lent.delete(id);
      if (id === 'battle') settle();
    },
  };
}

function paintStage(info: ReturnType<SelectScreen['lobbyInfo']>): void {
  const big = document.getElementById('pv-big');
  if (!big) return;
  const s = info.stage;
  big.querySelector('b')!.textContent = s?.name ?? '随机场景';
  big.classList.toggle('rand', !s);
  const src = s?.image ?? '';
  if (big.dataset.src === src) return;
  big.dataset.src = src;
  big.style.backgroundImage = '';
  if (src) applyImageUrl(src, url => { if (big.dataset.src === src) big.style.backgroundImage = `url("${url}")`; });
}

function paintWho(info: ReturnType<SelectScreen['lobbyInfo']>): void {
  const who = document.getElementById('pv-who');
  if (!who) return;
  const c = info.owner;
  face(who.querySelector('img')!, c);
  who.querySelector('b')!.textContent = c.name;
  who.querySelector('.pw-title')!.textContent = c.title;
  who.querySelector('q')!.textContent = c.quote.replace(/^「|」$/g, '');
  who.querySelector('.pw-pas')!.innerHTML = `<em>被动 · ${esc(c.passive[0])}</em>${esc(c.passive[1])}`;
  /* 右半边（2P / 对面一队）的头像描 2P 绿，左半边描 1P 黄。 */
  const at = info.sides.findIndex(x => x.slot === info.side);
  who.classList.toggle('right', at >= 0 && at >= info.sides.length / 2);
  const seg = who.querySelector<HTMLElement>('.seg')!;
  seg.hidden = info.sides.length < 2;
  const key = info.sides.map(x => `${x.slot}${x.mark}${x.name}`).join('|') + '#' + info.side;
  if (seg.dataset.key === key) return;
  seg.dataset.key = key;
  seg.innerHTML = info.sides.map(x => `<button type="button" data-side="${x.slot}"${x.slot === info.side ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"'}>${esc(x.mark)} · ${esc(x.name)}</button>`).join('');
  for (const btn of seg.querySelectorAll<HTMLButtonElement>('button')) btn.onclick = () => select.pickSide(Number(btn.dataset.side));
}

function registerPrep(): void {
  registerHubPage('battle', prepPage('battle', '作战', 'BATTLE', host => {
    host.innerHTML = '<div class="pb-stage"></div><div class="pb-pick"></div>';
    return [host.children[0], host.children[1]];
  }));
  registerHubPage('stage', prepPage('stage', '场景', 'STAGE', host => {
    host.innerHTML = '<div class="pv-big" id="pv-big"><b></b><small>开打时载入 · 点右侧换场景</small></div><div class="ps-cards"></div>';
    return [host.children[1]];
  }));
  registerHubPage('moves', prepPage('moves', '招式', 'MOVES', host => {
    host.innerHTML = '<aside class="pv-who" id="pv-who"><span class="seg" role="group" aria-label="看谁的招式"></span>'
      + '<div class="pw-face"><img alt=""><span><b></b><span class="pw-title"></span></span></div><q></q><div class="pw-pas"></div></aside><div class="pm-list"></div>';
    return [host.children[1]];
  }));
  setPrepMeta(id => {
    if (!isPrep(id)) return '';
    const info = select.lobbyInfo();
    if (id === 'battle') {
      const short = (c?: CharacterData) => c ? shortName(c) : '';
      return `${short(info.cast[0])} VS ${short(info.cast[info.cast.length - 1])}`;
    }
    if (id === 'stage') return info.stage?.name ?? '随机';
    return `${info.moves} 招`;
  });
}

/* ---- 开合：大厅只在横屏手机、选人页在台上时出现 ---- */
/** 上一次 sync 时的布局：转屏的交接（子视图 ↔ 竖屏那一段）只在布局真的变了时做。
    device.ts 在同一次 resize 里也会改 body 的类，两条路都走这里，先到的那次做完交接。 */
let lastLayout = layoutNow();
function sync(): void {
  const layout = layoutNow();
  const turned = layout !== lastLayout;
  const wasLand = lastLayout === 'land';
  lastLayout = layout;
  const want = layout === 'land' && !document.body.classList.contains('in-battle');
  const lobby = $('lobby');
  const open = hubOpen();
  /* 横 → 竖：子视图收起（节点搬回），选人页滚到对应的那一段。后台页开着不动它，竖屏也有后台页。 */
  if (turned && wasLand && isPrep(open)) {
    closeHub(true);
    const el = open === 'battle' ? q('#selection .stage-frame') : parts[open]()[0];
    requestAnimationFrame(() => requestAnimationFrame(() => el?.scrollIntoView({ block: 'start' })));
  }
  if (want !== on) {
    on = want;
    lobby.hidden = !want;
    root.classList.toggle('lobby-on', want);
    if (want) {
      pickArt();
      paint();
      /* 大厅按真实可见高度铺（和后台页一样），沉浸模式切换时不露底。 */
      settleAppHeight();
      /* 刚从隐藏变成显示：初始化时量到的是 0（跳过了），ResizeObserver 也不保证报这一下，这里主动量一次。 */
      fit();
      requestAnimationFrame(fit);
      window.scrollTo(0, 0);
    }
  }
  /* 竖 → 横：竖屏正看着某一段，直接打开它的子视图；页顶就停在大厅。 */
  if (turned && on && !wasLand && !hubOpen() && seenPrep) openHub(seenPrep);
}

/** 选人页的画面（舞台立绘、名册）此刻在不在屏幕上：被大厅盖住、被后台页盖住时不画，备战子视图打开时照画。 */
export function selectOnScreen(): boolean {
  if (hubOpen() === 'battle') return true;
  return !root.classList.contains('hub-covered') && !on;
}

/* ---- 横竖屏映射 ---- */
/** 竖屏时最近一次看到的那一段。转到横屏就打开对应的子视图（页顶算大厅）。 */
let seenPrep: PrepId | null = null;
function watchPortrait(): void {
  if (typeof IntersectionObserver === 'undefined') return;
  const watch: [Element | null, PrepId][] = [
    [q('#selection .lobby-actions'), 'battle'], [$('roster'), 'battle'],
    [q('#selection .stage-select'), 'stage'], [q('#selection .bottom-grid'), 'moves'],
  ];
  const ratio = new Map<Element, number>();
  /* 只在竖屏记：转屏那一刻观察器会按新版式再报一次，那一次不能覆盖竖屏时看到的位置。 */
  const portrait = () => !on && layoutNow() !== 'land';
  const io = new IntersectionObserver(entries => {
    if (!portrait()) return;
    for (const e of entries) ratio.set(e.target, e.isIntersecting ? e.intersectionRect.height : 0);
    if (window.scrollY < 80) { seenPrep = null; return; }
    let best: PrepId | null = null, most = 0;
    for (const [el, id] of watch) if (el && (ratio.get(el) ?? 0) > most) { most = ratio.get(el)!; best = id; }
    seenPrep = best;
  }, { threshold: [0, .25, .5, .75, 1] });
  for (const [el] of watch) if (el) io.observe(el);
  window.addEventListener('scroll', () => { if (portrait() && window.scrollY < 80) seenPrep = null; }, { passive: true });
}

/* ---- 缩放：大厅按设计稿 852×393 等比缩放（同 Unity Canvas Scaler 的 Expand / Cocos 的 SHOW_ALL）。
   --lu = min(宽 ÷ 852, 高 ÷ 393)，写在根上（顶栏不在 #lobby 里）。入口群、顶栏、底角都用同一个系数整体缩放，
   所以任何尺寸下块、字、图形之间的比例都等于设计稿；多出来的宽度给美术，多出来的高度让入口群上下居中。
   只接收有限正数，隐藏时（宽高 0）不写。 ---- */
export const LOBBY_W = 852, LOBBY_H = 393;
const LU_MIN = 0.72;
/** 上限：桌面的 CSS 像素在物理尺寸上本来就比手机大（约 1.6 倍），再放大到 2 倍以上入口群又大又笨。
    超过上限就钉住，入口群在顶栏和底边之间上下居中，多出来的宽度给美术。 */
const LU_MAX = 1.5;
function fit(): void {
  if (!on) return;
  const el = document.getElementById('lobby');
  if (!el) return;
  const { width: w, height: h } = el.getBoundingClientRect();
  /* 可读下限：系数不低于 LU_MIN（四格标题约 11px），前提是入口群（400 宽）不超过屏宽 60%、高度放得下。
     只在 640 宽以下的小屏生效，比设计稿多占一点宽度，换字号不掉到看不清。 */
  const lu = Math.min(LU_MAX, Math.max(Math.min(w / LOBBY_W, h / LOBBY_H), Math.min(LU_MIN, h / LOBBY_H, w * 0.6 / 400)));
  if (!Number.isFinite(lu) || lu <= 0) return;
  const v = lu.toFixed(4);
  if (root.style.getPropertyValue('--lu') !== v) root.style.setProperty('--lu', v);
}
function watchFit(): void {
  const el = document.getElementById('lobby');
  if (el && typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(el);
  window.addEventListener('resize', fit, { passive: true });
  fit();
}

export function bindLobby(s: SelectScreen): void {
  select = s;
  registerPrep();
  select.onRefresh = () => { if (on || isPrep(hubOpen())) paint(); };
  for (const b of document.querySelectorAll<HTMLButtonElement>('#lobby [data-prep]')) b.onclick = () => openHub(b.dataset.prep as HubId, b.closest<HTMLElement>('.lb-slab') ?? b);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#lobby [data-hub]')) b.onclick = () => openHub(b.dataset.hub as HubId, b);
  /* 快速开打：等同于按选人页的开打（main.ts 在 pointerdown 上把这一下让给全屏，和 #start 一样）。 */
  $('lobby-quick').onclick = () => { if ($('start').getAttribute('aria-disabled') !== 'true') $('start').click(); };
  /* 任务可领取：只留红点里的数字。曲名：跟着顶栏的音乐弹层。都直接读已经算好的字。 */
  const ready = $('bs-ready'), dot = $('lb-ready');
  const song = $('music-title'), cap = $('lb-song');
  const mirror = () => {
    const n = ready.hidden ? '' : (ready.textContent ?? '').replace(/\D+/g, '');
    if (dot.hidden !== !n) dot.hidden = !n;
    if (dot.textContent !== n) dot.textContent = n;
    if (cap.textContent !== song.textContent) cap.textContent = song.textContent ?? '';
  };
  const mo = new MutationObserver(mirror);
  mo.observe(ready, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
  mo.observe(song, { childList: true, characterData: true, subtree: true });
  mirror();
  onPhoneLayout(sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  watchPortrait();
  watchFit();
  sync();
}

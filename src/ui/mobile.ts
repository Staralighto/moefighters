/* 手机上的后台页（商店 / 仓库 / 任务 / 音乐库及其弹窗）：版式判定 + 触感层。
   版式只看视口尺寸（能力判定仍只住在 device.ts）：
   - 横屏手机：矮且宽（高 ≤ 540、宽高比 ≥ 4:3）。一屏摆完，分类在左侧竖轨，列表横滑。
   - 竖屏手机：宽 ≤ 760 且不是横屏手机。分类等分不滑，文字不截断，弹窗贴底。
   CSS 不直接写这两条查询，跟本文件挂在 <html> 上的 ph-land / ph-port 走（见下方「大厅模式」）。桌面常规尺寸两条都不命中，版式不变。
   触感（音效、震动）只在 body.touch 上生效，键鼠访问保持原样。 */

import { reducedMotion } from './motion.ts';
import { onMediaChange } from './media.ts';
import type { UiSound } from '../audio/sfx.ts';

export const LANDSCAPE_PHONE = '(max-height: 540px) and (min-aspect-ratio: 4 / 3)';
export const PORTRAIT_PHONE = '(max-width: 760px) and (min-height: 541px), (max-width: 760px) and (max-aspect-ratio: 1332 / 1000)';
/** 大厅模式手动开着时，横过来的判据：宽高比 ≥ 4:3（和 LANDSCAPE_PHONE 同一条比例线，去掉了高度上限）。更方或竖着的窗口退回滚动页。 */
export const WIDE_ENOUGH = '(min-aspect-ratio: 4 / 3)';
const land = matchMedia(LANDSCAPE_PHONE);
const port = matchMedia(PORTRAIT_PHONE);
const wide = matchMedia(WIDE_ENOUGH);

/* ---- 大厅模式（设置 › 外观）：自动 = 横屏小屏手机开、其他关；开 / 关 = 玩家手动，所有设备都照办。
   两个概念分开：
   - lobbyMode()：此刻有没有大厅（以及备战三站、「‹ 大厅」返回、回大厅确认）。
   - phoneLayout()：后台页用哪套版式，只看屏幕：横屏手机（不论大厅模式）用横屏版式，桌面版式在 393 高里放不下；
     开了大厅模式的 PC / iPad 仍用桌面版式——桌面本来就是为它设计的，把手机版式整体放大只会又糊又挤（试过，已撤）。
   CSS 不再直接写这两条查询：这里把结果挂到 <html> 上（ph-land / ph-port / lobby-mode），样式表跟类走。 ---- */
export type LobbyPref = 'auto' | 'on' | 'off';
const LOBBY_KEY = 'mf-lobby';
let lobbyPref: LobbyPref = (() => {
  try { const v = localStorage.getItem(LOBBY_KEY); return v === 'on' || v === 'off' ? v : 'auto'; } catch { return 'auto'; }
})();
export function lobbyPrefValue(): LobbyPref { return lobbyPref; }
export function lobbyMode(): boolean { return lobbyPref === 'on' ? wide.matches : lobbyPref === 'off' ? false : land.matches; }

export type PhoneLayout = 'land' | 'port' | null;
export function phoneLayout(): PhoneLayout { return land.matches ? 'land' : port.matches ? 'port' : null; }

const listeners: (() => void)[] = [];
let last = '';
function mark(): void {
  const lay = phoneLayout(), lob = lobbyMode();
  const key = `${lay}|${lob}`;
  const cl = document.documentElement.classList;
  cl.toggle('ph-land', lay === 'land');
  cl.toggle('ph-port', lay === 'port');
  cl.toggle('lobby-mode', lob);
  if (key === last) return;
  last = key;
  for (const fn of listeners) fn();
}
mark();
onMediaChange(land, mark);
onMediaChange(port, mark);
onMediaChange(wide, mark);
/* 兜底：有的 WebView（以及不在渲染的页面）不派发媒体查询的 change；尺寸变了就再判一次，结果没变不通知。 */
for (const ev of ['resize', 'orientationchange', 'pageshow'] as const) window.addEventListener(ev, mark, { passive: true });
/** 版式或大厅模式变了就通知（查询翻转、设置改了都算）；同一个结果不重复通知。 */
export function onPhoneLayout(change: () => void): void { listeners.push(change); }

export function setLobbyPref(v: LobbyPref): void {
  lobbyPref = v;
  try { if (v === 'auto') localStorage.removeItem(LOBBY_KEY); else localStorage.setItem(LOBBY_KEY, v); } catch { /* private mode */ }
  mark();
}

const isTouch = () => document.body.classList.contains('touch');

/* ---- 音效：main.ts 接上 sfx。页面只说「发生了什么」，音色在 audio/sfx.ts。 ---- */
let sink: (k: UiSound, step?: number) => void = () => {};
export function setUiCue(fn: (k: UiSound, step?: number) => void): void { sink = fn; }
export function cue(k: UiSound, step?: number): void { if (isTouch()) sink(k, step); }

/** 短震。只给购买、领取、不可用这几个关键时刻；iOS 浏览器没有这个 API，静默跳过。 */
export function buzz(pattern: number | number[]): void {
  if (!isTouch()) return;
  try { navigator.vibrate?.(pattern); } catch { /* 宿主禁用 */ }
}

/** 不可用的按钮被按下：抖一下 + deny + 短震。 */
export function refuse(el: HTMLElement | null): void {
  cue('deny');
  buzz([12, 40, 12]);
  if (!el || reducedMotion()) return;
  el.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 280, easing: 'ease-out' });
}

/* ---- 委托：后台页与它的弹窗里，按钮点下去默认一声 tap。
   data-cue 指定别的音色；data-cue="none" 表示由代码自己发声（购买、领取）。 ---- */
const SCOPE = '#hub, .album-dialog, .frame-dialog, .gift-dialog, #stamp-dialog';
export function bindFeel(): void {
  document.addEventListener('click', e => {
    if (!isTouch() || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>('button, [role="button"], .mc[data-id] .mc-art');
    if (!el || !el.closest(SCOPE) || (el as HTMLButtonElement).disabled) return;
    const k = el.dataset.cue;
    if (k === 'none') return;
    cue((k as UiSound) || 'tap');
  }, { capture: true, passive: true });
}

/* ---- 滚动锁：后台页和弹窗里，上下拖只交给真的还能往那个方向滚的区域。
   滚不动的区域（内容放得下、或已滚到头）里上下拖会被浏览器交给整页，地址栏随之收放、整屏元素跟着跳。
   这里在拖动开始时找手指下最近的可竖滚区域，滚不动就拦下这次移动；左右滑不管。 ---- */
const LOCK_SCOPE = '#hub, dialog[open]';
function vScroller(from: Element, stop: Element): HTMLElement | null {
  for (let el: Element | null = from; el && el !== stop.parentElement; el = el.parentElement) {
    if (!(el instanceof HTMLElement)) continue;
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return null;
}
export function bindScrollLock(): void {
  let x0 = 0, y0 = 0, scope: Element | null = null, decided = false;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    scope = e.touches.length === 1 && e.target instanceof Element ? e.target.closest(LOCK_SCOPE) : null;
    x0 = t?.clientX ?? 0; y0 = t?.clientY ?? 0; decided = false;
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', e => {
    if (!scope || decided || !e.cancelable || !(e.target instanceof Element)) return;
    const t = e.touches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    decided = true;
    if (Math.abs(dx) >= Math.abs(dy)) return;
    const sc = vScroller(e.target, scope);
    const atTop = !sc || sc.scrollTop <= 0, atEnd = !sc || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
    /* 手指往下拖 = 往上翻：已经在顶就没得滚；往上拖同理看底。 */
    if ((dy > 0 && atTop) || (dy < 0 && atEnd)) { e.preventDefault(); decided = false; }
  }, { passive: false, capture: true });
}

/** 竖向的局部滚动区（分类栏等）：下面还有内容时挂 data-more，CSS 给底边一道渐隐，滑到底就撤掉。 */
export function fadeMore(el: HTMLElement): void {
  const paint = () => {
    const more = el.scrollHeight - el.clientHeight - el.scrollTop > 1;
    if ((el.dataset.more === '1') !== more) { if (more) el.dataset.more = '1'; else delete el.dataset.more; }
  };
  paint();
  if (el.dataset.fade) return;
  el.dataset.fade = '1';
  el.addEventListener('scroll', paint, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(paint).observe(el);
}

/* ---- 竖屏抽屉往下拖关闭：只认抽屉顶部 60px（把手那一条）起手，跟手下移；拖过 110px 或甩得够快就关，否则弹回。 ---- */
export function bindSheetDrag(): void {
  let d: HTMLDialogElement | null = null, y0 = 0, t0 = 0, dy = 0;
  const reduced = reducedMotion;
  const reset = () => { if (d) d.style.transform = ''; d = null; };
  document.addEventListener('touchstart', e => {
    d = null;
    if (!isTouch() || phoneLayout() !== 'port' || e.touches.length !== 1 || !(e.target instanceof Element)) return;
    const dlg = e.target.closest<HTMLDialogElement>('dialog.frame-dialog[open], dialog.album-dialog[open]');
    if (!dlg || e.target.closest('button')) return;
    const y = e.touches[0].clientY;
    if (y - dlg.getBoundingClientRect().top > 60) return;
    d = dlg; y0 = y; t0 = performance.now(); dy = 0;
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', e => {
    if (!d) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    d.style.transform = `translateY(${dy}px)`;
  }, { passive: true, capture: true });
  document.addEventListener('touchend', () => {
    if (!d) return;
    const dlg = d;
    const fast = dy > 30 && dy / Math.max(1, performance.now() - t0) > .6;
    if (dy > 110 || fast) {
      cue('back');
      const h = dlg.getBoundingClientRect().height;
      if (reduced()) { dlg.close(); reset(); return; }
      const a = dlg.animate([{ transform: `translateY(${dy}px)` }, { transform: `translateY(${h}px)` }], { duration: 180, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
      a.onfinish = () => { dlg.close(); a.cancel(); dlg.style.transform = ''; };
      d = null;
    } else {
      if (!reduced() && dy > 0) dlg.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2, .9, .3, 1.2)' });
      reset();
    }
  }, { capture: true });
  document.addEventListener('touchcancel', reset, { capture: true });
}

/** 触屏上点抽屉 / 弹窗外面的暗色区域就关掉（点到的是 dialog 本身而不是里面的内容 = 点在遮罩上）。 */
export function bindBackdropClose(): void {
  document.addEventListener('click', e => {
    const d = e.target;
    if (!isTouch() || !(d instanceof HTMLDialogElement) || !d.open || !d.matches('.frame-dialog, .album-dialog')) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { cue('back'); d.close(); }
  });
}

/** 横滑轨道：每滑过一格轻轻 tick 一下（像拨过一张卡），最多 25 次/秒。 */
export function tickRail(rail: HTMLElement): void {
  if (rail.dataset.tick) return;
  rail.dataset.tick = '1';
  let last = -1, at = 0;
  rail.addEventListener('scroll', () => {
    if (!isTouch()) return;
    const first = rail.querySelector<HTMLElement>(':scope > *:not([hidden])');
    if (!first) return;
    const vertical = rail.scrollHeight - rail.clientHeight > rail.scrollWidth - rail.clientWidth;
    const pitch = (vertical ? first.offsetHeight : first.offsetWidth) + 12;
    const i = Math.round((vertical ? rail.scrollTop : rail.scrollLeft) / Math.max(40, pitch));
    if (i === last) return;
    const now = performance.now();
    if (last !== -1 && now - at > 40) { cue('tick'); at = now; }
    last = i;
  }, { passive: true });
}

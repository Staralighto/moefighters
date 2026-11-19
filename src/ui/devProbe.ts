/* 开发用检测工具，只在 npm run dev 下加载（main.ts 动态 import），挂到已有的 window.__mf 上。
   用法见 docs/motion-and-loading.md「验证」。浏览器面板被隐藏时页面不出帧：动画 finish、媒体查询 change、resize 都不派发，
   所以先 __mf.reduce(true) 走无动画路径，改视口后先截一张图（强制出一帧）再 __mf.scan()。

   __mf.go('shop' | 'locker' | 'tasks' | 'music' | 'battle' | 'stage' | 'moves')  打开后台页（null = 回大厅 / 选人页）
   __mf.reduce(true | false | null)   强制「减少动态效果」（null = 跟随系统）
   __mf.settle()                       有限次数的动画全部快进到结束
   __mf.load(ms | null)                之后每次进后台页都演一遍 ms 毫秒的加载条（null = 按预测）
   __mf.lobby('auto' | 'on' | 'off')   大厅模式
   __mf.scan()                         { truncated, overflow }：被截断的文字、超出屏幕的元素（滚动容器里的不算）
   __mf.geometry()                     大厅缩放系数、入口群和当前后台页的几何 */

import { closeHub, hubOpen, openHub, type HubId } from './hub.ts';
import { forceReducedMotion } from './motion.ts';
import { forceLoadMs } from './loadGate.ts';
import { setLobbyPref, type LobbyPref } from './mobile.ts';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function settle(): void {
  for (const a of document.getAnimations()) {
    try { if (a.effect?.getTiming().iterations !== Infinity) a.finish(); } catch { /* 无限动画或已结束 */ }
  }
}

async function go(id: HubId | null): Promise<string> {
  if (hubOpen()) { closeHub(true); await sleep(30); }
  if (id) { openHub(id); await sleep(60); settle(); }
  return document.documentElement.className;
}

const rect = (el: Element | null) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
};
const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}|${(el.textContent ?? '').trim().slice(0, 16)}`;

/** 文字被省略号截断，或多行截断超出半行以上。 */
function truncated(root: ParentNode): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (!el.offsetParent || el.children.length > 2 || !el.textContent?.trim()) continue;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 16;
    if ((cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
      || (cs.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + lh * .5)) out.push(label(el));
  }
  return out;
}

/** 超出屏幕的元素：有滚动 / 裁切的祖先（滚动容器、overflow: hidden）里的不算。 */
function overflow(root: Element): string[] {
  const out: string[] = [];
  const W = window.innerWidth, H = window.innerHeight;
  const clipped = (el: Element) => {
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
    }
    return false;
  };
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if ((r.right > W + 1 || r.bottom > H + 1 || r.left < -1) && !clipped(el)) out.push(label(el));
  }
  return out.slice(0, 20);
}

function scan(): { truncated: string[]; overflow: string[] } {
  const page = document.querySelector('#hub:not([hidden]) .hub-page:not([hidden])');
  const scope = page ?? document.getElementById('lobby');
  return {
    truncated: truncated(document.querySelector('#hub:not([hidden])') ?? document.body),
    overflow: scope ? overflow(scope) : [],
  };
}

function geometry(): Record<string, unknown> {
  return {
    viewport: [window.innerWidth, window.innerHeight],
    classes: document.documentElement.className,
    lu: document.documentElement.style.getPropertyValue('--lu'),
    deck: rect(document.querySelector('.lb-deck')),
    page: rect(document.querySelector('#hub:not([hidden]) .hub-page:not([hidden])')),
  };
}

const w = window as unknown as { __mf?: Record<string, unknown> };
w.__mf = Object.assign(w.__mf ?? {}, {
  go, back: () => go(null), settle, scan, geometry,
  reduce: (v: boolean | null) => forceReducedMotion(v),
  load: (ms: number | null) => forceLoadMs(ms),
  lobby: (v: LobbyPref) => setLobbyPref(v),
});

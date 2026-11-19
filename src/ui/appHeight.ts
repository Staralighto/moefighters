/* 后台页（商店 / 仓库 / 任务 / 音乐库）和它们的弹窗在手机上的真实可见高度。
   它们本来靠 `position: fixed; inset: 0` 铺满，可浏览器在沉浸模式（地址栏已收起）里切换状态时，
   不一定更新固定定位的参照框：参照框还停在地址栏出现时的高度，盒子就比屏幕矮一截，下面露出空白，
   要转一次屏触发整页重排才恢复。战斗里的上下黑边是同一类问题（见 docs/device-adaptation.md、touchLayout.ts）。
   和战斗一样，只有可信的视觉视口更矮时才钉住全屏外壳；其余交给 CSS 的动态视口高度。
   --app-h / --app-top 仍供弹窗和内部版式取尺寸。
   打开页面、转屏、全屏切换、回前台之后 2.5 秒内每帧比一次（落定那一下不一定再发事件），页面开着时每秒巡检兜底。 */

import { onPhoneLayout } from './mobile.ts';

const root = document.documentElement;
let last = '';

function measure(): void {
  const vv = window.visualViewport;
  const w = window.innerWidth, layoutHeight = window.innerHeight;
  const valid = Number.isFinite(layoutHeight) && layoutHeight >= 2;
  let h = valid ? layoutHeight : 0, top = 0;
  const pin = vv && valid && Number.isFinite(w) && w >= 2
    && Number.isFinite(vv.height) && vv.height >= 2 && Math.abs(vv.width - w) <= 2
    && (vv.width > vv.height) === (w > h) && vv.height < h - 2;
  /* 转屏期间即使方向已经相同，视觉视口的宽度不一致也可能仍是上一阶段的旧数据。 */
  if (pin) {
    const offset = Number.isFinite(vv.offsetTop) ? vv.offsetTop : 0;
    top = Math.min(Math.max(0, offset), h - vv.height);
    h = vv.height;
  }
  const height = Math.round(h), offset = Math.round(top);
  const sig = `${height},${offset},${!!pin}`;
  if (sig === last) return;
  last = sig;
  if (valid) root.style.setProperty('--app-h', `${height}px`);
  else root.style.removeProperty('--app-h');
  root.style.setProperty('--app-top', `${offset}px`);
  if (pin) root.style.setProperty('--app-pin-h', `${height}px`);
  else root.style.removeProperty('--app-pin-h');
}

let until = 0;
let raf = 0;
const tick = () => {
  raf = 0;
  measure();
  if (performance.now() < until) raf = requestAnimationFrame(tick);
};

/** 状态刚变（进后台页、开弹窗、转屏……）：接下来 2.5 秒每帧量一次。 */
export function settleAppHeight(): void {
  measure();
  until = performance.now() + 2500;
  if (!raf) raf = requestAnimationFrame(tick);
}

export function bindAppHeight(): void {
  measure();
  for (const ev of ['resize', 'orientationchange', 'pageshow'] as const) window.addEventListener(ev, settleAppHeight);
  screen.orientation?.addEventListener?.('change', settleAppHeight);
  document.addEventListener('fullscreenchange', settleAppHeight);
  document.addEventListener('webkitfullscreenchange', settleAppHeight);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settleAppHeight(); });
  window.visualViewport?.addEventListener('resize', settleAppHeight);
  /* 大厅模式开关、横竖版式翻转：大厅 / 后台页的定高跟着重量。 */
  onPhoneLayout(settleAppHeight);
  window.visualViewport?.addEventListener('scroll', measure);
  setInterval(() => { if (!document.hidden && (root.classList.contains('hub-open') || root.classList.contains('lobby-on'))) measure(); }, 1000);
}

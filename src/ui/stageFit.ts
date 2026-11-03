/**
 * 战斗画面怎么放进一块可见区域。
 *
 * 对照：Godot 的 Expand（多出来的边画内容，不留黑边、不拉伸）、Unity Canvas Scaler
 * 的 Match（UI 按更紧的那条边收）、William Malone 的安全框（合法站位不裁）、
 * YAGE / PlayCanvas 的安全视口（一条矩形同时扣掉浏览器可视区和系统安全区）。
 *
 * 画面比例由 battleFrame 决定。本文件只放两件与比例无关的纯函数：
 * 可见矩形（浮层定位用）和摇杆中心夹紧。
 */

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** 视觉视口在布局视口里的位置。缺了视觉视口时用布局视口本身，偏移为 0。 */
export interface VisualView {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
}

export interface ViewportMeasures {
  innerWidth: number;
  innerHeight: number;
  clientWidth: number;
  clientHeight: number;
  visual: VisualView | null;
}

/**
 * 布局视口里的安全矩形 ∩ 视觉视口。
 * 安全区从布局视口的边往里量，视觉视口是地址栏剩下的那一块。两边取交集，
 * 刘海和地址栏各扣一次：已经落在安全区里的视觉视口不会被再扣一刀。
 * 几个高度取最小的那个当视觉高度——有的浏览器把 innerHeight / dvh 报得比屏幕高。
 */
export function visibleBox(m: ViewportMeasures, insets: Insets): ViewBox {
  const size = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 2;
  const positive = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;
  const widths = [m.innerWidth, m.clientWidth, m.visual?.width].filter(size);
  const heights = [m.innerHeight, m.clientHeight, m.visual?.height].filter(size);
  const layoutW = size(m.clientWidth) ? m.clientWidth : size(m.innerWidth) ? m.innerWidth : widths[0] ?? 0;
  const layoutH = size(m.innerHeight) ? m.innerHeight : size(m.clientHeight) ? m.clientHeight : heights[0] ?? 0;
  const visW = widths.length ? Math.min(...widths) : 0;
  const visH = heights.length ? Math.min(...heights) : 0;
  // A WebView can publish the previous orientation's offset for one frame. Keep it in the new viewport.
  const visLeft = Math.min(positive(m.visual?.offsetLeft ?? 0), Math.max(0, layoutW - visW));
  const visTop = Math.min(positive(m.visual?.offsetTop ?? 0), Math.max(0, layoutH - visH));
  let safeLeft = positive(insets.left), safeRight = positive(insets.right);
  let safeTop = positive(insets.top), safeBottom = positive(insets.bottom);
  if (safeLeft + safeRight >= layoutW) safeLeft = safeRight = 0;
  if (safeTop + safeBottom >= layoutH) safeTop = safeBottom = 0;
  const left = Math.max(safeLeft, visLeft);
  const top = Math.max(safeTop, visTop);
  const right = Math.min(layoutW - safeRight, visLeft + visW);
  const bottom = Math.min(layoutH - safeBottom, visTop + visH);
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** 把摇杆中心（百分比）收进场地，使 1.25 倍环的盒子不探出边。 */
export function clampStick(xPct: number, yPct: number, ring: number, viewW: number, viewH: number): { x: number; y: number } {
  if (!Number.isFinite(xPct)) xPct = 12;
  if (!Number.isFinite(yPct)) yPct = 82;
  if (!Number.isFinite(viewW) || !Number.isFinite(viewH) || !(viewW > 0) || !(viewH > 0)) return { x: xPct, y: yPct };
  const half = Number.isFinite(ring) ? Math.max(0, Math.min(ring * 1.25, viewW, viewH)) / 2 : 0;
  const axis = (pct: number, size: number) => {
    const want = pct / 100 * size;
    const lo = half;
    const hi = Math.max(half, size - half);
    const pos = Math.min(hi, Math.max(lo, want));
    return pos / size * 100;
  };
  return { x: axis(xPct, viewW), y: axis(yPct, viewH) };
}

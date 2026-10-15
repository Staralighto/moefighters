/** Same-document history entry. A container Back pops this instead of closing the webview. */
export const SWIPE_STAY = 'mf-stay';

export function isSwipeStay(state: unknown): boolean {
  return !!state && typeof state === 'object' && (state as { mf?: unknown }).mf === SWIPE_STAY;
}

/** Touch only. A mouse visit keeps the browser Back button. */
export function swipeGuardWanted(touch: boolean): boolean {
  return touch;
}

/**
 * WebKit starts the back/forward swipe at touchstart, inside about 20px of the
 * screen edge (iOS 13.4+). 24 covers that slop. A narrower viewport than two
 * strips has no safe interior, so it is left alone.
 */
export const SWIPE_EDGE = 24;

export function swipeEdgeHit(x: number, width: number): boolean {
  return width > SWIPE_EDGE * 2 && (x <= SWIPE_EDGE || x >= width - SWIPE_EDGE);
}

/** A button, link, or dialog still needs its click. The stick is not one of these. */
export function swipeEdgeBlock(x: number, width: number, clickable: boolean): boolean {
  return !clickable && swipeEdgeHit(x, width);
}

/** A real sideways slide, not the jitter of a tap. Vertical scrolling stays. */
export function swipeEdgeSlide(dx: number, dy: number): boolean {
  return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy);
}

/** The toy script is only the webview's bridge. A normal phone keeps the history sentinel and does not fetch it. */
export function toyScriptWanted(host: string, block: boolean, hasBridge: boolean): boolean {
  return block && !hasBridge && /(^|\.)bilibili\.com$/i.test(host);
}

export type SwipePop = 'skip' | 'rearm' | 'idle';

/**
 * A Back while the guard is up must put the sentinel back. The pop from our own
 * disarm is ignored, unless touch came back before that pop landed.
 */
export function swipeGuardPop(armed: boolean, skipping: boolean): SwipePop {
  if (armed) return 'rearm';
  return skipping ? 'skip' : 'idle';
}

/** Click targets keep their tap. The stick and the arena are not in this list. */
const CLICKABLE = 'dialog, button, a, input, select, textarea, label, summary';

let armed = false;
let skipping = false;
let edgeId: number | null = null;
let edgeX = 0;
let edgeY = 0;
/** Latest request to the host. A late SDK load applies this, not the call that started the load. */
let wantOff = false;
/** Landscape or turned fight: the page eats moves so a stick push is not a scroll. Select still scrolls. */
let eatMoves = false;
let sdkLoad: Promise<void> | null = null;

function pushStay(): void {
  try { history.pushState({ mf: SWIPE_STAY }, '', location.href); }
  catch { /* sandboxed frame: the gesture belongs to the host */ }
}

type NativeCall = {
  method: string;
  data?: Record<string, unknown>;
  callback?: () => void;
};

/** Official bridge bundled in toy-sdk.js. The app webview does not always inject the JS wrapper. */
function bridge(): { callNative: (call: NativeCall) => void } | null {
  const host = window as Window & { biliBridge?: { callNative?: (call: NativeCall) => void } };
  return typeof host.biliBridge?.callNative === 'function' ? host.biliBridge as { callNative: (call: NativeCall) => void } : null;
}

function loadSdk(): Promise<void> {
  if (bridge()) return Promise.resolve();
  if (sdkLoad) return sdkLoad;
  sdkLoad = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return sdkLoad;
}

/**
 * Toy JS SDK's bridge maps `ui.setDragGestureEnabled` + `enabled` onto the native
 * `ui.setDragGestureEnable` + `enable`. Both fields are sent so a host that skipped
 * the mapper still sees the flag it reads.
 */
function applyHost(): void {
  const b = bridge();
  if (!b) return;
  const on = !wantOff;
  try {
    b.callNative({
      method: 'ui.setDragGestureEnabled',
      data: { enabled: on, enable: on },
      callback: () => {},
    });
  } catch { /* host without this method: the history sentinel still absorbs one Back */ }
}

function syncHost(block: boolean): void {
  if (wantOff === block) return;
  wantOff = block;
  if (!toyScriptWanted(location.hostname, block, !!bridge())) {
    if (bridge()) applyHost();
    return;
  }
  void loadSdk().then(applyHost);
}

function setArmed(on: boolean): void {
  if (on === armed) return;
  armed = on;
  syncHost(on);
  if (on) {
    if (!isSwipeStay(history.state)) pushStay();
    return;
  }
  if (!isSwipeStay(history.state)) return;
  skipping = true;
  history.back();
}

function onPop(): void {
  const step = swipeGuardPop(armed, skipping);
  skipping = false;
  if (step === 'rearm') pushStay();
}

function blockMove(e: TouchEvent): void {
  if (!armed || !e.cancelable) return;
  if (e.touches.length > 1) {
    e.preventDefault();
    return;
  }
  if (!eatMoves) return;
  const t = e.target;
  if (t instanceof Element && t.closest('dialog')) return;
  e.preventDefault();
}

function onEdgeStart(e: TouchEvent): void {
  edgeId = null;
  if (!armed || e.touches.length !== 1) return;
  const t = e.touches[0];
  if (!swipeEdgeHit(t.clientX, window.innerWidth)) return;
  edgeId = t.identifier;
  edgeX = t.clientX;
  edgeY = t.clientY;
  if (!e.cancelable) return;
  const el = e.target;
  const clickable = el instanceof Element && !!el.closest(CLICKABLE);
  if (!swipeEdgeBlock(t.clientX, window.innerWidth, clickable)) return;
  // WebKit only drops the edge-pan if touchstart itself is cancelled. Later moves are too late.
  // Do not stopPropagation: pointerdown has already begun the stick. preventDefault on
  // pointerdown is what drops the other thumb.
  e.preventDefault();
}

function blockEdgeMove(e: TouchEvent): void {
  if (!armed || edgeId === null || !e.cancelable) return;
  let t: Touch | null = null;
  for (const one of e.touches) if (one.identifier === edgeId) t = one;
  if (!t || !swipeEdgeSlide(t.clientX - edgeX, t.clientY - edgeY)) return;
  const el = e.target;
  if (el instanceof Element && el.closest('dialog')) return;
  e.preventDefault();
}

function clearEdge(e: TouchEvent): void {
  if (edgeId === null) return;
  for (const one of e.changedTouches) if (one.identifier === edgeId) edgeId = null;
}

/**
 * Bilibili's toy webview reads a rightward swipe as Back, and closes when history
 * is empty. On a touch device that gesture stays off for the whole visit.
 * A mouse visit never pushes the sentinel and never calls the host, so Back,
 * text selection, and zoom stay as the browser left them.
 * The host switch is `ui.setDragGestureEnabled` (toy-sdk.js, JSB 3.3.3). Container
 * mode only accepts orientation and immersive, so this is not a setContainerMode flag.
 * The browser's own edge-pan is refused at touchstart (WebKit 13.4+). A sideways
 * follow-up move is refused too, for hosts that ignore the touchstart cancel.
 * Touch moves are cancelled only while a landscape fight owns the screen; the
 * select page keeps scrolling. Buttons and dialogs keep their click.
 * ponytail: a host that finishes the activity without asking the webview still leaves.
 * Android's system back gesture is claimed before the page, and no web API turns it off.
 */
export function bindSwipeGuard(): void {
  const landscape = matchMedia('(orientation: landscape)');
  const sync = () => {
    const body = document.body.classList;
    const touch = body.contains('touch');
    eatMoves = touch && body.contains('in-battle') && (landscape.matches || body.contains('turned'));
    setArmed(swipeGuardWanted(touch));
  };
  landscape.addEventListener('change', sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('touchstart', onEdgeStart, { passive: false, capture: true });
  document.addEventListener('touchmove', blockMove, { passive: false, capture: true });
  document.addEventListener('touchmove', blockEdgeMove, { passive: false, capture: true });
  document.addEventListener('touchend', clearEdge, { capture: true });
  document.addEventListener('touchcancel', clearEdge, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wantOff) applyHost();
  });
  window.addEventListener('popstate', onPop);
  sync();
}

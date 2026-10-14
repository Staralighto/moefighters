/** Same-document history entry. A container Back pops this instead of closing the webview. */
export const SWIPE_STAY = 'mf-stay';

export function isSwipeStay(state: unknown): boolean {
  return !!state && typeof state === 'object' && (state as { mf?: unknown }).mf === SWIPE_STAY;
}

/** Real landscape, or the portrait phone turned sideways for the fight. */
export function swipeGuardWanted(touch: boolean, inBattle: boolean, landscape: boolean, turned: boolean): boolean {
  return touch && inBattle && (landscape || turned);
}

export type SwipePop = 'skip' | 'rearm' | 'idle';

/**
 * A Back while the guard is up must put the sentinel back. The pop from our own
 * disarm is ignored, unless the fight went landscape again before that pop landed.
 */
export function swipeGuardPop(armed: boolean, skipping: boolean): SwipePop {
  if (armed) return 'rearm';
  return skipping ? 'skip' : 'idle';
}

let armed = false;
let skipping = false;

function pushStay(): void {
  try { history.pushState({ mf: SWIPE_STAY }, '', location.href); }
  catch { /* sandboxed frame: the gesture belongs to the host */ }
}

function setArmed(on: boolean): void {
  if (on === armed) return;
  armed = on;
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
  const t = e.target;
  if (t instanceof Element && t.closest('dialog')) return;
  e.preventDefault();
}

/**
 * Bilibili's toy webview reads a rightward swipe as Back, and closes when history
 * is empty. On a phone held sideways that swipe is the stick. One same-url entry
 * absorbs the Back; popstate pushes it again. Touch moves are cancelled so the
 * page keeps the gesture.
 * ponytail: a host that finishes the activity without asking the webview still
 * leaves. Toy JS SDK 1.7 only has orientation and immersive, not this gesture.
 */
export function bindSwipeGuard(): void {
  const landscape = matchMedia('(orientation: landscape)');
  const sync = () => {
    const body = document.body.classList;
    setArmed(swipeGuardWanted(
      body.contains('touch'),
      body.contains('in-battle'),
      landscape.matches,
      body.contains('turned'),
    ));
  };
  landscape.addEventListener('change', sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('touchmove', blockMove, { passive: false, capture: true });
  window.addEventListener('popstate', onPop);
  sync();
}

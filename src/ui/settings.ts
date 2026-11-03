/** Header settings: roster layout stays on the select screen; training switches live here
 *  and are handed to FightGame as the same object, so a change during a match applies on the next step. */

import { bindPopoverFallback, closePopover, openPopover, popoverOpen, positionPopover } from './overlays.ts';
import { visibleBox } from './stageFit.ts';

const KEY = 'mf-train';

export interface TrainPrefs {
  /** U / I / O ignore their cooldown. J / K keep theirs. */
  noCd: boolean;
  /** The super meter stays full. */
  infiniteUlt: boolean;
}

const prefs: TrainPrefs = { noCd: true, infiniteUlt: true };

function loadTrain(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Partial<TrainPrefs>;
    if (typeof s.noCd === 'boolean') prefs.noCd = s.noCd;
    if (typeof s.infiniteUlt === 'boolean') prefs.infiniteUlt = s.infiniteUlt;
  } catch { /* private mode, or no localStorage */ }
}
loadTrain();

export function trainPrefs(): TrainPrefs { return prefs; }

export function setTrainPrefs(patch: Partial<TrainPrefs>): void {
  if (typeof patch.noCd === 'boolean') prefs.noCd = patch.noCd;
  if (typeof patch.infiniteUlt === 'boolean') prefs.infiniteUlt = patch.infiniteUlt;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

/** Where a menu should sit: right-aligned under the trigger, flipped above when it would
 *  leave the viewport, then clamped. ponytail: one vertical flip, no full collision solver.
 *  A menu taller than the screen pins to the top edge. */
export function placePick(
  anchor: { right: number; top: number; bottom: number },
  menu: { width: number; height: number },
  view: { width: number; height: number; left?: number; top?: number },
): { top: number; left: number } {
  const gap = 4, edge = 8;
  const leftEdge = (view.left ?? 0) + edge, topEdge = (view.top ?? 0) + edge;
  const rightEdge = (view.left ?? 0) + view.width - edge, bottomEdge = (view.top ?? 0) + view.height - edge;
  let top = anchor.bottom + gap;
  if (top + menu.height > bottomEdge) top = anchor.top - gap - menu.height;
  top = Math.max(topEdge, Math.min(top, bottomEdge - menu.height));
  let left = anchor.right - menu.width;
  left = Math.max(leftEdge, Math.min(left, rightEdge - menu.width));
  return { top, left };
}

/** Menus and the battle share the same visual-viewport coordinates after zoom or a keyboard. */
function menuViewport() {
  const vv = window.visualViewport;
  return visibleBox({
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight,
    visual: vv ? { width: vv.width, height: vv.height, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop } : null,
  }, { top: 0, right: 0, bottom: 0, left: 0 });
}

export interface PickBinding {
  get(): string;
  set(value: string): void;
}

/** One listbox; returns its re-sync, for state that another control can also change. The menu is a popover (top layer, out of flow) so opening it cannot grow the
 *  dialog or summon a scrollbar. Coordinates are written in the toggle handler, before paint,
 *  and the UA's centered `inset: 0; margin: auto` is cleared in CSS — otherwise the menu
 *  flashes in the middle of the screen. Focus uses preventScroll so the dialog does not jump. */
export function bindPick(menuId: string, binding: PickBinding): () => void {
  const menu = document.getElementById(menuId);
  const btn = document.querySelector<HTMLButtonElement>(`[popovertarget="${menuId}"]`);
  if (!menu || !btn) return () => {};
  bindPopoverFallback(menu, btn);
  const dialog = menu.closest('dialog');
  if (dialog && !dialog.dataset.picks) {
    dialog.dataset.picks = '1';
    dialog.addEventListener('close', () => {
      for (const m of dialog.querySelectorAll<HTMLElement>('.pick-menu, .tip-pop')) {
        closePopover(m);
      }
    });
  }
  const valueEl = btn.querySelector('.pick-value');
  const options = [...menu.querySelectorAll<HTMLButtonElement>('[role="option"]')];

  const sync = (): void => {
    const value = binding.get();
    for (const opt of options) {
      const on = opt.dataset.value === value;
      opt.setAttribute('aria-selected', String(on));
      if (on && valueEl) valueEl.textContent = opt.textContent;
    }
  };

  const place = (): void => {
    const view = menuViewport();
    const w = Math.min(btn.offsetWidth, Math.max(1, view.width - 16));
    menu.style.width = w + 'px';
    menu.style.maxWidth = w + 'px';
    menu.style.maxHeight = Math.max(1, Math.min(260, view.height - 16)) + 'px';
    const box = placePick(
      btn.getBoundingClientRect(),
      { width: menu.offsetWidth, height: menu.offsetHeight },
      view,
    );
    positionPopover(menu, box);
  };

  menu.addEventListener('beforetoggle', e => {
    if ((e as ToggleEvent).newState === 'open' && btn.disabled) e.preventDefault();
  });

  menu.addEventListener('toggle', (e) => {
    const open = (e as ToggleEvent).newState === 'open';
    btn.setAttribute('aria-expanded', String(open));
    if (open) place();
    else if (menu.contains(document.activeElement)) btn.focus({ preventScroll: true });
  });

  const reposition = (): void => { if (popoverOpen(menu)) place(); };
  window.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  menu.closest('dialog')?.addEventListener('scroll', reposition);

  btn.addEventListener('keydown', e => {
    if (btn.disabled) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!popoverOpen(menu)) openPopover(menu);
    const opt = e.key === 'ArrowUp' ? options[options.length - 1] : options[0];
    opt?.focus({ preventScroll: true });
  });

  menu.addEventListener('keydown', e => {
    const i = options.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = e.key === 'ArrowDown' ? (i + 1) % options.length : (i - 1 + options.length) % options.length;
      options[n].focus({ preventScroll: true });
    }
  });

  for (const opt of options) {
    opt.addEventListener('click', () => {
      const value = opt.dataset.value;
      if (!value || value === binding.get()) { closePopover(menu); return; }
      binding.set(value);
      sync();
      closePopover(menu);
    });
  }
  sync();
  return sync;
}

/** 说明气泡跟下拉一样，打开前钉在按钮旁，避免先出现在屏幕正中。 */
export function bindTip(popId: string): void {
  const pop = document.getElementById(popId);
  const btn = document.querySelector<HTMLButtonElement>(`[popovertarget="${popId}"]`);
  if (!pop || !btn) return;
  bindPopoverFallback(pop, btn);
  const place = () => {
    const view = menuViewport();
    pop.style.maxWidth = Math.max(1, Math.min(16 * Number.parseFloat(getComputedStyle(pop).fontSize), view.width - 16)) + 'px';
    pop.style.maxHeight = Math.max(1, view.height - 16) + 'px';
    const box = placePick(
      btn.getBoundingClientRect(),
      { width: pop.offsetWidth, height: pop.offsetHeight },
      view,
    );
    positionPopover(pop, box);
  };
  pop.addEventListener('toggle', e => { if ((e as ToggleEvent).newState === 'open') place(); });
  const reposition = () => { if (popoverOpen(pop)) place(); };
  window.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  pop.closest('dialog')?.addEventListener('scroll', reposition);
}

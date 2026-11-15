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
  /** 木桩一直按住格挡：练削防、破防、完美格挡和抓投。 */
  dummyGuard: boolean;
  /** 连段一断（脱离受击 1 秒）就回满血，每套连段都从满血算。 */
  quickHeal: boolean;
}

const prefs: TrainPrefs = { noCd: true, infiniteUlt: true, dummyGuard: false, quickHeal: false };
const FLAGS = ['noCd', 'infiniteUlt', 'dummyGuard', 'quickHeal'] as const;

function loadTrain(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Partial<TrainPrefs>;
    for (const k of FLAGS) if (typeof s[k] === 'boolean') prefs[k] = s[k];
  } catch { /* private mode, or no localStorage */ }
}
loadTrain();

export function trainPrefs(): TrainPrefs { return prefs; }

export function setTrainPrefs(patch: Partial<TrainPrefs>): void {
  for (const k of FLAGS) if (typeof patch[k] === 'boolean') prefs[k] = patch[k];
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

/** Two or three options: a segmented row (`.seg`, role=radiogroup). Every option is visible, one tap
 *  picks. Returns its re-sync for state another control can also change. */
export function bindSeg(groupId: string, binding: PickBinding): () => void {
  const group = document.getElementById(groupId);
  if (!group) return () => {};
  const options = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const sync = (): void => {
    const value = binding.get();
    for (const opt of options) {
      const on = opt.dataset.value === value;
      opt.classList.toggle('active', on);
      opt.setAttribute('aria-checked', String(on));
      opt.tabIndex = on ? 0 : -1;
    }
  };
  for (const opt of options) {
    opt.addEventListener('click', () => {
      const value = opt.dataset.value;
      if (!value || value === binding.get()) return;
      binding.set(value);
      sync();
    });
  }
  group.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const i = options.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = options[(i + step + options.length) % options.length];
    next.focus({ preventScroll: true });
    next.click();
  });
  sync();
  return sync;
}

/** On / off: a switch (role=switch). Returns its re-sync. */
export function bindSwitch(id: string, binding: { get(): boolean; set(on: boolean): void }): () => void {
  const btn = document.getElementById(id) as HTMLButtonElement | null;
  if (!btn) return () => {};
  const sync = (): void => btn.setAttribute('aria-checked', String(binding.get()));
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    binding.set(!binding.get());
    sync();
  });
  sync();
  return sync;
}

/** Settings tabs. All panes share one grid cell so the dialog keeps the tallest pane's height and
 *  never jumps between tabs. Returns the opener: `show('controls')`. A hidden tab is skipped. */
export function bindTabs(dialog: HTMLElement): (tab?: string) => void {
  const tabs = [...dialog.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panes = [...dialog.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  const show = (name?: string, focus = false): void => {
    const live = tabs.filter(t => !t.hidden);
    const tab = live.find(t => t.dataset.tab === name) ?? live.find(t => t.classList.contains('active')) ?? live[0];
    if (!tab) return;
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    for (const p of panes) p.classList.toggle('on', p.dataset.tab === tab.dataset.tab);
    if (focus) tab.focus({ preventScroll: true });
    for (const m of dialog.querySelectorAll<HTMLElement>('.tip-pop')) closePopover(m);
  };
  for (const t of tabs) t.addEventListener('click', () => show(t.dataset.tab));
  dialog.querySelector('[role="tablist"]')?.addEventListener('keydown', e => {
    const k = (e as KeyboardEvent).key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    const live = tabs.filter(t => !t.hidden);
    const i = live.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    show(live[(i + (k === 'ArrowLeft' ? -1 : 1) + live.length) % live.length].dataset.tab, true);
  });
  show();
  return tab => show(tab);
}

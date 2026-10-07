/** Header settings: roster layout stays on the select screen; training switches live here
 *  and are handed to FightGame as the same object, so a change during a match applies on the next step. */

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
  view: { width: number; height: number },
): { top: number; left: number } {
  const gap = 4, edge = 8;
  let top = anchor.bottom + gap;
  if (top + menu.height > view.height - edge) top = Math.max(edge, anchor.top - gap - menu.height);
  let left = anchor.right - menu.width;
  if (left + menu.width > view.width - edge) left = view.width - edge - menu.width;
  if (left < edge) left = edge;
  return { top, left };
}

export interface PickBinding {
  get(): string;
  set(value: string): void;
}

/** One listbox. The menu is a popover (top layer, out of flow) so opening it cannot grow the
 *  dialog or summon a scrollbar. Coordinates are written in the toggle handler, before paint,
 *  and the UA's centered `inset: 0; margin: auto` is cleared in CSS — otherwise the menu
 *  flashes in the middle of the screen. Focus uses preventScroll so the dialog does not jump. */
export function bindPick(menuId: string, binding: PickBinding): void {
  const menu = document.getElementById(menuId);
  const btn = document.querySelector<HTMLButtonElement>(`[popovertarget="${menuId}"]`);
  if (!menu || !btn) return;
  const dialog = menu.closest('dialog');
  if (dialog && !dialog.dataset.picks) {
    dialog.dataset.picks = '1';
    dialog.addEventListener('close', () => {
      for (const m of dialog.querySelectorAll<HTMLElement>('.pick-menu')) {
        if (m.matches(':popover-open')) m.hidePopover();
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
    const w = btn.offsetWidth;
    menu.style.width = w + 'px';
    menu.style.maxWidth = w + 'px';
    const box = placePick(
      btn.getBoundingClientRect(),
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menu.style.top = box.top + 'px';
    menu.style.left = box.left + 'px';
  };

  menu.addEventListener('toggle', (e) => {
    const open = (e as ToggleEvent).newState === 'open';
    btn.setAttribute('aria-expanded', String(open));
    if (open) place();
    else if (menu.contains(document.activeElement)) btn.focus({ preventScroll: true });
  });

  const reposition = (): void => { if (menu.matches(':popover-open')) place(); };
  window.addEventListener('resize', reposition);
  menu.closest('dialog')?.addEventListener('scroll', reposition);

  btn.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!menu.matches(':popover-open')) menu.showPopover();
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
      if (!value || value === binding.get()) { menu.hidePopover(); return; }
      binding.set(value);
      sync();
      menu.hidePopover();
    });
  }
  sync();
}

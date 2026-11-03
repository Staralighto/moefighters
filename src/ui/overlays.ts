/** Keep settings usable in WebViews without the Popover API; no unsupported selector is queried. */
export function popoverOpen(el: HTMLElement): boolean {
  return el.classList.contains('popover-fallback') ? !el.hidden : el.matches(':popover-open');
}

function fallbackToggle(el: HTMLElement, open: boolean): void {
  if (el.hidden === !open) return;
  el.hidden = !open;
  el.dispatchEvent(Object.assign(new Event('toggle'), { newState: open ? 'open' : 'closed' }));
}

export function closePopover(el: HTMLElement): void {
  if (el.classList.contains('popover-fallback')) fallbackToggle(el, false);
  else if (typeof el.hidePopover === 'function') el.hidePopover();
}

export function openPopover(el: HTMLElement): void {
  if (el.classList.contains('popover-fallback')) {
    for (const other of document.querySelectorAll<HTMLElement>('.popover-fallback')) if (other !== el) closePopover(other);
    fallbackToggle(el, true);
  } else if (typeof el.showPopover === 'function') el.showPopover();
}

export function bindPopoverFallback(el: HTMLElement, button: HTMLButtonElement): void {
  if (typeof el.showPopover === 'function' && typeof el.hidePopover === 'function') return;
  el.removeAttribute('popover');
  el.classList.add('popover-fallback');
  el.hidden = true;
  button.addEventListener('click', e => {
    e.preventDefault();
    if (!button.disabled) {
      if (popoverOpen(el)) closePopover(el);
      else openPopover(el);
    }
  });
  document.addEventListener('pointerdown', e => {
    if (popoverOpen(el) && e.target instanceof Node && !el.contains(e.target) && !button.contains(e.target)) closePopover(el);
  }, { capture: true });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !popoverOpen(el)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closePopover(el);
    button.focus({ preventScroll: true });
  }, { capture: true });
}

/** Fixed fallback menus inside a translated dialog use that dialog's padding box as their origin. */
export function positionPopover(el: HTMLElement, box: { top: number; left: number }): void {
  const dialog = el.classList.contains('popover-fallback') ? el.closest<HTMLElement>('.dialog-fallback') : null;
  const host = dialog?.getBoundingClientRect();
  el.style.top = (box.top - (host ? host.top + dialog!.clientTop : 0)) + 'px';
  el.style.left = (box.left - (host ? host.left + dialog!.clientLeft : 0)) + 'px';
}

const fallbackDialogs: HTMLDialogElement[] = [];

/** A local fallback on each dialog, leaving browsers with native modal behavior untouched. */
export function bindDialogFallback(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function' && typeof dialog.close === 'function') return;
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';
  backdrop.hidden = true;
  document.body.append(backdrop);
  dialog.classList.add('dialog-fallback');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('tabindex', '-1');
  if (typeof dialog.open !== 'boolean') Object.defineProperty(dialog, 'open', { get: () => dialog.hasAttribute('open') });
  const focusables = () => [...dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
    .filter(el => !el.matches(':disabled') && el.tabIndex >= 0 && el.getClientRects().length > 0);
  dialog.showModal = () => {
    if (dialog.open) return;
    fallbackDialogs.push(dialog);
    const z = 40 + fallbackDialogs.length * 2;
    backdrop.style.zIndex = String(z);
    dialog.style.zIndex = String(z + 1);
    dialog.setAttribute('open', '');
    dialog.setAttribute('aria-modal', 'true');
    backdrop.hidden = false;
    (focusables()[0] ?? dialog).focus({ preventScroll: true });
  };
  dialog.close = () => {
    if (!dialog.open) return;
    const index = fallbackDialogs.indexOf(dialog);
    if (index >= 0) fallbackDialogs.splice(index, 1);
    dialog.removeAttribute('open');
    dialog.removeAttribute('aria-modal');
    backdrop.hidden = true;
    dialog.dispatchEvent(new Event('close'));
  };
  backdrop.addEventListener('click', () => { if (fallbackDialogs[fallbackDialogs.length - 1] === dialog) dialog.close(); });
  document.addEventListener('keydown', e => {
    if (fallbackDialogs[fallbackDialogs.length - 1] !== dialog) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const cancel = new Event('cancel', { cancelable: true });
      if (dialog.dispatchEvent(cancel)) dialog.close();
    } else if (e.key === 'Tab') {
      const list = focusables();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at + 1) % list.length;
      e.preventDefault();
      (list[next] ?? dialog).focus({ preventScroll: true });
    }
  });
}

/** Segmented pickers get one sliding chip instead of each button repainting its own fill. The chip
 *  follows whichever button carries .active; the buttons keep their classes, so nothing else changes. */

export function mountSegThumbs(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.seg').forEach(seg => {
    if (seg.querySelector(':scope > .seg-thumb')) return;
    const thumb = document.createElement('i');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    seg.prepend(thumb);
    seg.classList.add('thumbed');
    const sync = () => {
      const on = [...seg.querySelectorAll<HTMLButtonElement>(':scope > button.active')].find(b => b.offsetParent !== null);
      if (!on) { thumb.style.opacity = '0'; return; }
      thumb.style.opacity = '1';
      thumb.style.setProperty('--x', on.offsetLeft + 'px');
      thumb.style.setProperty('--w', on.offsetWidth + 'px');
    };
    new MutationObserver(sync).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sync).observe(seg);
    sync();
    // First placement snaps; only later moves slide.
    requestAnimationFrame(() => requestAnimationFrame(() => seg.classList.add('thumb-live')));
  });
}

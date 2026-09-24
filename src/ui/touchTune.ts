/** Dev-only. Drag a pad control, and the drop writes src/ui/touchLayout.data.ts. */
export function mountTouchTune(pad: HTMLElement): void {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'tp-tune';
  open.textContent = '键位';
  pad.append(open);

  let drag: HTMLElement | null = null;

  const placeOf = (el: HTMLElement) => {
    const raw = el.style.getPropertyValue('--x') || getComputedStyle(el).getPropertyValue('--x');
    const rawY = el.style.getPropertyValue('--y') || getComputedStyle(el).getPropertyValue('--y');
    return { x: parseFloat(raw), y: parseFloat(rawY) };
  };

  const moveTo = (el: HTMLElement, clientX: number, clientY: number) => {
    const box = pad.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = Math.round(Math.min(100, Math.max(0, (clientX - box.left) / box.width * 100)) * 10) / 10;
    const y = Math.round(Math.min(100, Math.max(0, (clientY - box.top) / box.height * 100)) * 10) / 10;
    el.style.setProperty('--x', x + '%');
    el.style.setProperty('--y', y + '%');
  };

  const save = () => {
    const layout: Record<string, { x: number; y: number }> = {};
    for (const el of pad.querySelectorAll<HTMLElement>('[data-pad]')) {
      const id = el.dataset.pad;
      const place = placeOf(el);
      if (!id || !Number.isFinite(place.x) || !Number.isFinite(place.y)) return;
      layout[id] = place;
    }
    open.textContent = '写入中…';
    void fetch('/__touch-layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(layout),
    }).then(res => {
      open.textContent = res.ok ? '已写入' : '没写上';
    }).catch(() => { open.textContent = '没写上'; });
  };

  open.addEventListener('pointerdown', e => e.stopPropagation());
  open.addEventListener('click', () => {
    const on = document.body.classList.toggle('pad-tune');
    open.textContent = on ? '拖按键，松手写入' : '键位';
  });

  pad.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('pad-tune')) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pad]');
    if (!el || !pad.contains(el)) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    drag = el;
    moveTo(el, e.clientX, e.clientY);
  });
  pad.addEventListener('pointermove', e => {
    if (!drag || !drag.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    moveTo(drag, e.clientX, e.clientY);
  });
  pad.addEventListener('pointerup', e => {
    if (!drag?.hasPointerCapture(e.pointerId)) return;
    drag.releasePointerCapture(e.pointerId);
    drag = null;
    save();
  });
  pad.addEventListener('pointercancel', () => { drag = null; });
}

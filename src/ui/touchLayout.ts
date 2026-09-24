import { TOUCH_LAYOUT } from './touchLayout.data.ts';

/** Paint saved centers onto the pad. Inline styles win over the CSS defaults. */
export function applyTouchLayout(): void {
  for (const [id, place] of Object.entries(TOUCH_LAYOUT)) {
    const el = document.querySelector<HTMLElement>(`[data-pad="${id}"]`);
    if (!el) continue;
    el.style.setProperty('--x', place.x + '%');
    el.style.setProperty('--y', place.y + '%');
  }
}

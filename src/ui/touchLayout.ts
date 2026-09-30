import { battleFrame } from './battleFrame.ts';
import { TOUCH_LAYOUT } from './touchLayout.data.ts';

/** Paint saved centers onto the pad. Inline styles win over the CSS defaults. Only the stick is free-placed now. */
export function applyTouchLayout(): void {
  for (const [id, place] of Object.entries(TOUCH_LAYOUT)) {
    const el = document.querySelector<HTMLElement>(`[data-pad="${id}"]`);
    if (!el) continue;
    el.style.setProperty('--x', place.x + '%');
    el.style.setProperty('--y', place.y + '%');
  }
}

/**
 * Landscape phones: fill the arena width, park the floor, and hand `.in-tower` the one number the keys derive from.
 * The keys themselves are laid out by CSS off `--atk`, anchored to the bottom-right of this box.
 */
export function bindBattleFrame(): void {
  const arena = document.getElementById('arena');
  const canvas = document.getElementById('game');
  const pad = document.getElementById('touchpad');
  if (!arena || !canvas || !pad) return;
  const landscape = matchMedia('(orientation: landscape)');
  /**
   * `100dvh` is the layout viewport on several mobile browsers, so on a landscape phone it can be taller than
   * what is actually on screen. Anything anchored to the arena bottom then sits below the fold, so the arena is
   * pinned to the real visible height instead. The visual viewport is the honest number where the browser has it.
   */
  const fit = () => {
    const vv = window.visualViewport;
    const h = Math.round(Math.min(window.innerHeight, vv ? vv.height : Infinity));
    arena.style.height = h >= 2 ? `${h}px` : '';
  };
  const apply = () => {
    // 宽屏（桌面全屏开关）走同一条管线，但没有横竖屏门槛：窗口什么比例都铺。
    const touchOn = document.body.classList.contains('touch') && landscape.matches;
    const wideOn = document.body.classList.contains('wide');
    const on = (touchOn || wideOn)
      && document.body.classList.contains('in-battle')
      && arena.clientWidth >= 2
      && arena.clientHeight >= 2;
    if (!on) {
      arena.style.height = '';
      canvas.style.top = '';
      canvas.style.height = '';
      pad.classList.remove('in-tower');
      pad.style.removeProperty('--atk');
      arena.style.removeProperty('--hud');
      applyTouchLayout();
      return;
    }
    fit();
    // The keys are sized and placed off --atk, so the arena width is the only number they need.
    pad.classList.add('in-tower');
    pad.style.setProperty('--atk', `${arena.clientWidth * .09}px`);
    const frame = battleFrame(arena.clientWidth, arena.clientHeight);
    canvas.style.height = `${Math.round(frame.imageH)}px`;
    canvas.style.top = `${Math.round(frame.top)}px`;
    // 手机用 frame.hud（高度占比）：矮屏把 HUD 压到和桌面 16:9 相同的画面占比，之前整倍放大会太大。
    // 宽屏不走占比：桌面窗口按宽铺满后画面已放大 scale 倍，占比公式会让血条停在 1 倍像素尺寸，
    // 相对画面缩成一小条。这里让 HUD 跟画面同倍数，压在 1–2 倍之间，两条适配互不干涉。
    const hud = wideOn ? Math.min(2, Math.max(1, frame.scale)) : frame.hud;
    arena.style.setProperty('--hud', hud.toFixed(4));
    // The stick keeps its saved spot; the class moves it from the viewport box onto the pad box.
    applyTouchLayout();
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(arena);
  landscape.addEventListener('change', () => requestAnimationFrame(apply));
  window.addEventListener('resize', () => requestAnimationFrame(apply));
  window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(apply));
  new MutationObserver(() => requestAnimationFrame(apply)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  apply();
}

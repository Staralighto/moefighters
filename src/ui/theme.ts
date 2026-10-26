/** 主题开关。暗色是站点本色，亮色的颜色全部由 src/theme/palette.ts 从暗色 token 推导，这里只管挑哪一套。
 *  index.html 头部的内联脚本在首帧前读同一个键挂上 data-theme，这里负责之后的切换和「跟随系统」。 */

export type ThemePref = 'dark' | 'light' | 'system';

export const THEME_KEY = 'mf-theme';

const media = window.matchMedia?.('(prefers-color-scheme: light)');
let pref: ThemePref = 'dark';
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'system') pref = saved;
} catch { /* private mode, or no localStorage */ }

function apply(): void {
  const root = document.documentElement;
  const light = pref === 'light' || (pref === 'system' && !!media?.matches);
  // 换主题那一帧关掉过渡：有过渡的按钮会慢慢变色、没过渡的立刻变，整页会花一下。
  root.classList.add('theme-swap');
  if (light) root.dataset.theme = 'light';
  else delete root.dataset.theme;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')));
}

media?.addEventListener?.('change', () => { if (pref === 'system') apply(); });
apply();

export function themePref(): ThemePref { return pref; }

export function setThemePref(next: ThemePref): void {
  pref = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
  apply();
}

/* 详情弹窗里「翻页」：商店货架 / 仓库打开某一件的详情时，把同一分类的整串 id 交给这里。
   弹窗里左右滑（或点头部的 ‹ ›）就切到上一件 / 下一件：直接再调一次打开函数，弹窗已开着时它只原地刷新内容。
   参照明日方舟养成页「拖拽切换干员，始终停留在同一个画布上」。关弹窗即清空。 */

import { reducedMotion } from './motion.ts';
import { cue } from './mobile.ts';

let list: string[] = [];
let at = -1;
let openFn: ((id: string) => void) | null = null;

const dialogs = () => [...document.querySelectorAll<HTMLDialogElement>('.frame-dialog')];

function paintPager(): void {
  for (const d of dialogs()) {
    const p = d.querySelector<HTMLElement>('.dlg-pager');
    if (!p) continue;
    p.hidden = list.length < 2;
    const n = p.querySelector('.dlg-n');
    if (n) n.textContent = `${at + 1} / ${list.length}`;
  }
}

/** 打开详情之前调用：ids 是这一分类当前的排序，id 是要打开的那件，open 打开任意一件。 */
export function setBrowse(ids: string[], id: string, open: (id: string) => void): void {
  list = ids;
  at = ids.indexOf(id);
  openFn = open;
  if (at < 0) { list = []; openFn = null; }
  paintPager();
}

export function clearBrowse(): void { list = []; at = -1; openFn = null; paintPager(); }

function step(dir: -1 | 1): void {
  if (!openFn || list.length < 2) return;
  at = (at + dir + list.length) % list.length;
  const open = openFn;
  paintPager();
  cue('tick');
  const d = dialogs().find(x => x.open);
  open(list[at]);
  const grid = d?.querySelector<HTMLElement>('.fv-grid');
  if (grid && !reducedMotion()) {
    grid.animate([{ opacity: .3, transform: `translateX(${dir * 40}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 260, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  }
}

export function bindBrowse(): void {
  for (const d of dialogs()) {
    d.querySelector<HTMLButtonElement>('.dlg-prev')?.addEventListener('click', () => step(-1));
    d.querySelector<HTMLButtonElement>('.dlg-next')?.addEventListener('click', () => step(1));
    d.addEventListener('close', clearBrowse);
    /* 左右甩一下：横向够远（56px）且明显比竖向多，才算翻页；按钮、滑条上起手的不算。 */
    let x0 = 0, y0 = 0, ok = false;
    d.addEventListener('touchstart', e => {
      const t = e.touches[0];
      ok = e.touches.length === 1 && !(e.target instanceof Element && e.target.closest('button, input, .mp-bar'));
      x0 = t.clientX; y0 = t.clientY;
    }, { passive: true });
    d.addEventListener('touchend', e => {
      if (!ok || !openFn) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
  paintPager();
}

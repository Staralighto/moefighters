/* 物贩小票：买下东西时从出纸口一行行吐出来，停一下，撕下、折小，飞向 target（仓库按钮）；
   没有 target（在弹窗里买）就往右上角收起淡出。展台和详情弹窗共用。 */

import { reducedMotion } from './motion.ts';
import type { ItemDef } from '../shop/catalog.ts';
import { shards } from '../save/wallet.ts';
import { itemName } from './items.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const reduced = reducedMotion;

function receiptHTML(it: ItemDef): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const no = String(Math.floor(Math.random() * 9000) + 1000);
  return '<div class="rc-paper">'
    + '<p class="rc-h">萌趣格斗 · 物贩</p><p class="rc-s">MOE FIGHTERS MERCH STAND</p>'
    + `<p class="rc-row"><span>${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}</span><span>No.${no}</span></p>`
    + '<p class="rc-cut"></p>'
    + `<p class="rc-row"><span>${esc(itemName(it.id))}</span><span>✦${it.price}</span></p>`
    + `<p class="rc-row rc-total"><span>合计</span><span>✦${it.price}</span></p>`
    + `<p class="rc-row"><span>余额</span><span>✦${shards()}</span></p>`
    + '<p class="rc-cut"></p>'
    + '<p class="rc-bar" aria-hidden="true"></p><p class="rc-s">THANK YOU · 谢谢惠顾</p>'
    + '</div>';
}

export function printReceipt(printer: HTMLElement, it: ItemDef, target?: HTMLElement | null): Promise<void> {
  if (reduced()) return Promise.resolve();
  printer.classList.add('on');
  printer.innerHTML = receiptHTML(it);
  const paper = printer.querySelector<HTMLElement>('.rc-paper')!;
  return new Promise(resolve => {
    let settled = false;
    const animations: Animation[] = [];
    let hold: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      if (settled) return;
      settled = true;
      clearTimeout(failsafe);
      clearTimeout(hold);
      for (const a of animations) a.cancel();
      paper.remove();
      printer.classList.remove('on');
      resolve();
    };
    const failsafe = window.setTimeout(end, 4000);
    const print = paper.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 1100, easing: 'steps(14, end)', fill: 'both' });
    animations.push(print);
    print.onfinish = () => { hold = setTimeout(() => {
      const tear = paper.animate([{ rotate: '0deg', translate: '0 0' }, { rotate: '-3deg', translate: '0 8px' }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
      animations.push(tear);
      tear.onfinish = () => {
        const r = paper.getBoundingClientRect();
        /* 目标看不见（手机上收掉了仓库入口）就当没有目标：往右上角收起淡出。 */
        const t = target?.isConnected && target.offsetParent ? target.getBoundingClientRect() : null;
        const dx = t ? t.left + t.width / 2 - (r.left + r.width / 2) : r.width * .6;
        const dy = t ? t.top + t.height / 2 - (r.top + r.height / 2) : -r.height * .9;
        /* 详情弹窗 overflow:hidden，小票留在弹窗里飞不出去。挪到 body 上再飞向仓库。 */
        paper.style.position = 'fixed';
        paper.style.left = `${r.left}px`;
        paper.style.top = `${r.top}px`;
        paper.style.width = `${r.width}px`;
        paper.style.margin = '0';
        paper.style.zIndex = '80';
        document.body.append(paper);
        const fly = paper.animate([
          { translate: '0 8px', rotate: '-3deg', scale: '1 1', opacity: 1 },
          { translate: '0 8px', rotate: '-3deg', scale: '1 .35', opacity: 1, offset: .25 },
          { translate: `${dx * .5}px ${Math.min(dy, 0) - 70}px`, rotate: '12deg', scale: '.4 .14', opacity: 1, offset: .65 },
          { translate: `${dx}px ${dy}px`, rotate: '30deg', scale: '.1 .05', opacity: t ? .5 : 0 },
        ], { duration: 760, easing: 'cubic-bezier(.45, 0, .35, 1)', fill: 'forwards' });
        animations.push(fly);
        fly.onfinish = () => { target?.classList.remove('bump'); void target?.offsetWidth; target?.classList.add('bump'); end(); };
      };
    }, 650); };
  });
}

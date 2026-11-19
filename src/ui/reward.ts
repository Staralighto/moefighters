/* 领取奖励的演出。不是普通弹窗：
   1. 碎片从被领取的那几行（或专辑封面）飞向屏幕中央，每落下一颗，中间的大数字跳一下往上滚；
   2. 乐队色的几何块从四角切进来，中间一圈光环扩开；
   3. 有物品时，卡背朝上落下、翻面露出头像框，扫一道光；
   4. 「收下」出现。动画途中点任意处直接跳到最终画面。 */

import { reducedMotion } from './motion.ts';
import { itemKind, itemName, itemPreviewHTML } from './items.ts';
import { buzz, cue } from './mobile.ts';

const $ = (id: string) => document.getElementById(id)!;
const reduced = reducedMotion;
const SHARD = '<svg viewBox="0 0 256 256" aria-hidden="true"><use href="#i-shard"/></svg>';

export interface RewardShow { shards: number; items: string[]; sources: DOMRect[]; color?: string; title?: string }

let running: Animation[] = [];
let opener: (d: HTMLDialogElement) => void = d => d.showModal();
/** 走站点统一的打开方式（锁滚动、记焦点）。 */
export function setRewardOpener(fn: (d: HTMLDialogElement) => void): void { opener = fn; }
let finishAll: (() => void) | null = null;

export function showReward(r: RewardShow): Promise<void> {
  const dialog = $('reward-dialog') as HTMLDialogElement;
  const total = dialog.querySelector<HTMLElement>('.rw-total b')!;
  const items = dialog.querySelector<HTMLElement>('.rw-items')!;
  const fly = dialog.querySelector<HTMLElement>('.rw-fly')!;
  const ok = dialog.querySelector<HTMLButtonElement>('.rw-ok')!;
  dialog.style.setProperty('--rw', r.color ?? 'var(--brand)');
  dialog.querySelector('.rw-kicker')!.textContent = r.title ?? 'REWARD';
  items.innerHTML = r.items.map((id, i) => `<figure class="rw-card" style="--i:${i}"><div class="rw-flip"><div class="rw-back"><i></i></div><div class="rw-face">${itemPreviewHTML(id)}</div></div><figcaption><small>${itemKind(id)}</small>${itemName(id)}</figcaption></figure>`).join('');
  items.hidden = !r.items.length;
  fly.innerHTML = '';
  total.textContent = '+0';
  dialog.classList.remove('rw-done', 'rw-open', 'rw-landed');
  ok.hidden = true;
  opener(dialog);
  void dialog.offsetWidth;
  dialog.classList.add('rw-open');

  let shown = 0;
  const paint = (n: number) => { shown = n; total.textContent = '+' + Math.round(n).toLocaleString('en-US'); };
  const bump = () => { total.parentElement!.classList.remove('bump'); void total.offsetWidth; total.parentElement!.classList.add('bump'); };
  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    paint(r.shards);
    cue('chime');
    buzz(r.items.length ? [20, 60, 30] : 24);
    dialog.classList.add('rw-landed');
    ok.hidden = false;
    ok.focus({ preventScroll: true });
  };
  finishAll = () => {
    for (const a of running) a.finish();
    running = [];
    fly.innerHTML = '';
    dialog.classList.add('rw-done');
    land();
  };

  if (reduced() || !r.sources.length) {
    setTimeout(land, reduced() ? 0 : 450);
  } else {
    /* 每个来源 1–3 颗，总数封顶 28 颗；每颗分到的数额在落下时加上。 */
    const per = Math.max(1, Math.min(3, Math.floor(28 / r.sources.length)));
    const drops = r.sources.flatMap(rect => Array.from({ length: per }, () => rect)).slice(0, 28);
    const share = r.shards / drops.length;
    const target = total.getBoundingClientRect();
    const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
    let landed = 0;
    drops.forEach((rect, i) => {
      const el = document.createElement('i');
      el.className = 'rw-drop';
      el.innerHTML = SHARD;
      fly.append(el);
      const sx = rect.left + rect.width * (.3 + Math.random() * .4), sy = rect.top + rect.height / 2;
      const mx = (sx + tx) / 2 + (Math.random() - .5) * 220, my = Math.min(sy, ty) - 80 - Math.random() * 120;
      const a = el.animate([
        { translate: `${sx}px ${sy}px`, scale: .4, opacity: 0 },
        { translate: `${sx}px ${sy - 18}px`, scale: 1.1, opacity: 1, offset: .15 },
        { translate: `${mx}px ${my}px`, scale: 1, opacity: 1, offset: .55 },
        { translate: `${tx}px ${ty}px`, scale: .5, opacity: .9 },
      ], { duration: 720 + Math.random() * 160, delay: 260 + i * 55, easing: 'cubic-bezier(.45, 0, .55, 1)', fill: 'both' });
      running.push(a);
      a.onfinish = () => {
        el.remove();
        landed++;
        cue('coin', landed - 1);
        paint(Math.min(r.shards, shown + share));
        bump();
        if (landed === drops.length) land();
      };
    });
  }

  return new Promise(resolve => {
    const close = () => { dialog.close(); };
    ok.onclick = close;
    dialog.onclick = () => { if (!done) finishAll?.(); };
    dialog.addEventListener('close', () => { finishAll = null; for (const a of running) a.cancel(); running = []; resolve(); }, { once: true });
  });
}
